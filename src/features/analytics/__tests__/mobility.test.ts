import { buildExerciseWeek, buildMobilityWeek, isMobilityTimedSet, mobilitySecondsForWorkout } from '../mobility';
import type { CompletedSetRow } from '../summary';

function row(overrides: Partial<CompletedSetRow>): CompletedSetRow {
  return {
    workoutId: 'w1',
    workoutStartedAt: new Date('2026-09-25T10:00:00Z'),
    bodyweightKg: 70,
    exerciseId: 'pike-stretch',
    exerciseName: 'Pike stretch',
    category: 'mobility',
    movementPattern: 'hamstring-flexibility',
    metric: 'time',
    leverageFactor: null,
    setId: Math.random().toString(36),
    reps: null,
    durationSec: 60,
    distanceM: null,
    addedLoadKg: 0,
    completedAt: new Date('2026-09-25T10:05:00Z'),
    ...overrides,
  };
}

const now = new Date('2026-09-28T12:00:00Z');
const wristRocks = { exerciseId: 'wrist-rocks', metric: 'reps', reps: 15, durationSec: null };

describe('isMobilityTimedSet', () => {
  it('counts only mobility holds with a duration', () => {
    expect(isMobilityTimedSet(row({}))).toBe(true);
    expect(isMobilityTimedSet(row({ metric: 'time_load' }))).toBe(true);
    expect(isMobilityTimedSet(row(wristRocks))).toBe(false);
    expect(isMobilityTimedSet(row({ category: 'core' }))).toBe(false);
    expect(isMobilityTimedSet(row({ durationSec: 0 }))).toBe(false);
  });
});

describe('mobilitySecondsForWorkout', () => {
  it('sums the holds of that workout only', () => {
    const rows = [row({ durationSec: 45 }), row({ durationSec: 30 }), row(wristRocks), row({ workoutId: 'w2', durationSec: 90 }), row({ category: 'core', durationSec: 60 })];
    expect(mobilitySecondsForWorkout(rows, 'w1')).toBe(75);
    expect(mobilitySecondsForWorkout(rows, 'missing')).toBe(0);
  });
});

describe('buildMobilityWeek', () => {
  it('sums the last 7 days and counts workouts with any mobility set', () => {
    const rows = [
      row({ durationSec: 60 }),
      row({ workoutId: 'w2', workoutStartedAt: new Date('2026-09-27T08:00:00Z'), ...wristRocks }),
      row({ workoutId: 'old', workoutStartedAt: new Date('2026-09-20T08:00:00Z'), durationSec: 600 }),
      row({ workoutId: 'w3', category: 'push', metric: 'reps', durationSec: null }),
    ];
    expect(buildMobilityWeek(rows, now)).toEqual({ seconds: 60, sessions: 2 });
  });

  it('is empty without data', () => {
    expect(buildMobilityWeek([], now)).toEqual({ seconds: 0, sessions: 0 });
  });
});

describe('buildExerciseWeek', () => {
  it('counts sets and distinct workouts for a rep-based drill, without time', () => {
    const rows = [row(wristRocks), row(wristRocks), row({ workoutId: 'w2', ...wristRocks }), row({})];
    expect(buildExerciseWeek(rows, 'wrist-rocks', 'reps', now)).toEqual({ sets: 3, sessions: 2, seconds: null });
  });

  it('adds hold time for a timed exercise and ignores older workouts', () => {
    const rows = [row({ durationSec: 40 }), row({ durationSec: 50 }), row({ workoutId: 'old', workoutStartedAt: new Date('2026-09-01T08:00:00Z') })];
    expect(buildExerciseWeek(rows, 'pike-stretch', 'time', now)).toEqual({ sets: 2, sessions: 1, seconds: 90 });
  });
});
