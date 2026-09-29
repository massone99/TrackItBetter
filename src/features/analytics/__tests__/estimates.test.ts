import { buildExerciseEstimate, setEstimate } from '../estimates';
import { buildProgressSnapshot, type CompletedSetRow } from '../summary';

const at = (month: number, day: number) => new Date(2026, month - 1, day, 18);
const now = at(9, 28);

function row(overrides: Partial<CompletedSetRow>): CompletedSetRow {
  const date = overrides.completedAt ?? at(9, 20);
  return {
    workoutId: 'w1',
    workoutStartedAt: date,
    bodyweightKg: 70,
    exerciseId: 'pull-up',
    exerciseName: 'Pull-up',
    category: 'pull',
    movementPattern: 'vertical-pull',
    metric: 'reps',
    leverageFactor: null,
    setId: Math.random().toString(36),
    reps: 8,
    durationSec: null,
    distanceM: null,
    addedLoadKg: 0,
    completedAt: date,
    rpe: 8,
    ...overrides,
  };
}

describe('setEstimate', () => {
  it('reads reps and holds, never loaded sets', () => {
    expect(setEstimate(row({ reps: 10, rpe: 8 }))).toEqual({ kind: 'reps', value: 12 });
    expect(setEstimate(row({ metric: 'time', reps: null, durationSec: 40, rpe: 8 }))).toEqual({ kind: 'hold', value: 50 });
    expect(setEstimate(row({ metric: 'reps_load', addedLoadKg: 10 }))).toBeNull();
    expect(setEstimate(row({ rpe: null }))).toBeNull();
  });
});

describe('buildExerciseEstimate', () => {
  it('reports the latest rated set and the best of the last 30 days', () => {
    const rows = [
      row({ reps: 12, rpe: 7, completedAt: at(9, 1) }),
      row({ reps: 10, rpe: 9, completedAt: at(9, 25) }),
      row({ reps: 11, rpe: null, completedAt: at(9, 27) }),
      row({ reps: 20, rpe: 6, completedAt: at(7, 1) }),
    ];
    const estimate = buildExerciseEstimate(rows, 'pull-up', now);
    expect(estimate?.kind).toBe('reps');
    expect(estimate?.latest).toEqual({ value: 11, date: at(9, 25), done: 10, rpe: 9 });
    expect(estimate?.recentBest).toEqual({ value: 15, date: at(9, 1) });
  });

  it('uses the best set of the latest session, not its last tired set', () => {
    const rows = [
      row({ workoutId: 'b', reps: 10, rpe: 8, completedAt: at(9, 25) }),
      row({ workoutId: 'b', reps: 6, rpe: 9, completedAt: new Date(at(9, 25).getTime() + 600000), workoutStartedAt: at(9, 25) }),
    ];
    expect(buildExerciseEstimate(rows, 'pull-up', now)?.latest?.value).toBe(12);
  });

  it('flags unrated history and skips loaded exercises', () => {
    expect(buildExerciseEstimate([row({ rpe: null })], 'pull-up', now)).toEqual({ kind: 'reps', latest: null, recentBest: null });
    expect(buildExerciseEstimate([row({ metric: 'reps_load' })], 'pull-up', now)).toBeNull();
    expect(buildExerciseEstimate([], 'pull-up', now)).toBeNull();
  });
});

describe('progress trend estimates', () => {
  it('adds the best estimate per workout to bodyweight rep trends', () => {
    const rows = [
      row({ workoutId: 'a', reps: 8, rpe: 8, completedAt: at(9, 10) }),
      row({ workoutId: 'a', reps: 7, rpe: 9, completedAt: at(9, 10) }),
      row({ workoutId: 'b', reps: 9, rpe: 8, completedAt: at(9, 20) }),
    ];
    const trend = buildProgressSnapshot(rows, now).trends.find((item) => item.kind === 'reps');
    expect(trend?.estimate).toEqual([{ date: at(9, 10), value: 10 }, { date: at(9, 20), value: 11 }]);
  });

  it('leaves trends without rated sets untouched', () => {
    const rows = [row({ workoutId: 'a', rpe: null, completedAt: at(9, 10) }), row({ workoutId: 'b', rpe: null, completedAt: at(9, 20) })];
    expect(buildProgressSnapshot(rows, now).trends[0].estimate).toBeUndefined();
  });
});
