import { buildTrainingStats, OTHER_ID, periodId, type StatsSetRow } from '../trainingStats';

const at = (year: number, month: number, day: number, hour = 10) => new Date(year, month - 1, day, hour);
const now = at(2026, 9, 28, 20); // Monday

function row(overrides: Partial<StatsSetRow>): StatsSetRow {
  return {
    workoutId: 'w1', workoutName: 'Workout', workoutStartedAt: at(2026, 9, 28),
    exerciseId: 'push', exerciseName: 'Push-up', metric: 'reps',
    movementGroup: 'horizontal-push', movementTag: null,
    reps: 10, durationSec: null, addedLoadKg: 0, rpe: null,
    ...overrides,
  };
}

const weekRows = [
  row({ rpe: 8 }),
  row({ exerciseId: 'pull', exerciseName: 'Weighted pull-up', metric: 'reps_load', movementGroup: 'vertical-pull', reps: 5, addedLoadKg: 10, rpe: 9 }),
  row({ exerciseId: 'pull', exerciseName: 'Weighted pull-up', metric: 'reps_load', movementGroup: 'vertical-pull', reps: 5, addedLoadKg: 10, rpe: 9 }),
  row({ exerciseId: 'hold', exerciseName: 'Hang', metric: 'time_load', movementGroup: null, movementTag: 'Shoulder flexion', reps: null, durationSec: 30, addedLoadKg: 5 }),
  row({ workoutId: 'w0', workoutStartedAt: at(2026, 9, 21), reps: 8 }),
];

describe('periodId', () => {
  it('keys days, Monday-based weeks and months on local dates', () => {
    expect(periodId(at(2026, 9, 28), 'day')).toBe('2026-09-28');
    expect(periodId(at(2026, 9, 27), 'week')).toBe('2026-09-21'); // Sunday → previous Monday
    expect(periodId(at(2026, 9, 28), 'week')).toBe('2026-09-28');
    expect(periodId(at(2027, 1, 1), 'week')).toBe('2026-12-28'); // across the year boundary
    expect(periodId(at(2026, 9, 28), 'month')).toBe('2026-09');
    expect(periodId(new Date(2026, 0, 2, 23, 59), 'day')).toBe('2026-01-02');
  });
});

describe('buildTrainingStats', () => {
  it('aggregates the current week by movement group with Other last', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'group', period: 'week', anchor: null, threshold: 8, now });

    expect(stats.period).toMatchObject({ id: '2026-09-28', workoutName: null });
    expect(stats.period?.end).toEqual(at(2026, 10, 4, 0));
    expect(stats.summary).toEqual({ sets: 4, setsAtThreshold: 3, reps: 20, holdSeconds: 30, loadRepsKg: 100, loadSecondsKg: 150 });
    expect(stats.items.map((item) => item.id)).toEqual(['vertical-pull', 'horizontal-push', OTHER_ID]);
    expect(stats.items[0].metrics).toMatchObject({ sets: 2, reps: 10, loadRepsKg: 100, setsAtThreshold: 2 });
    expect(stats.history).toHaveLength(8);
    expect(stats.history.slice(-2).map(({ id, sets }) => ({ id, sets }))).toEqual([{ id: '2026-09-21', sets: 1 }, { id: '2026-09-28', sets: 4 }]);
    expect(stats.newerId).toBeNull();
    expect(stats.olderId).toBe('2026-09-21');
  });

  it('lists only tags with data, untagged last', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'tag', period: 'week', anchor: null, threshold: 8, now });
    expect(stats.items.map((item) => item.id)).toEqual(['Shoulder flexion', OTHER_ID]);
    expect(stats.items.find((item) => item.id === 'Shoulder flexion')?.metrics.holdSeconds).toBe(30);
  });

  it('groups by exercise with names, most sets first', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'exercise', period: 'week', anchor: null, threshold: 8, now });
    expect(stats.items.map((item) => item.name)).toEqual(['Weighted pull-up', 'Hang', 'Push-up']);
  });

  it('navigates older periods and exposes the newer one', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'group', period: 'day', anchor: '2026-09-21', threshold: 8, now });
    expect(stats.summary.sets).toBe(1);
    expect(stats.newerId).toBe('2026-09-22');
    expect(stats.olderId).toBeNull();
  });

  it('clamps an anchor in the future to the latest period', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'group', period: 'month', anchor: '2027-01', threshold: 8, now });
    expect(stats.period?.id).toBe('2026-09');
    expect(stats.newerId).toBeNull();
  });

  it('steps through sessions one workout at a time', () => {
    const latest = buildTrainingStats(weekRows, { dimension: 'group', period: 'session', anchor: null, threshold: 8, now });
    expect(latest.period).toMatchObject({ id: 'w1', workoutName: 'Workout' });
    expect(latest.olderId).toBe('w0');
    expect(latest.newerId).toBeNull();
    expect(latest.history.map((bar) => bar.id)).toEqual(['w0', 'w1']);

    const older = buildTrainingStats(weekRows, { dimension: 'group', period: 'session', anchor: 'w0', threshold: 8, now });
    expect(older.summary.sets).toBe(1);
    expect(older.newerId).toBe('w1');
    expect(older.olderId).toBeNull();
  });

  it('handles no data without a period for sessions and zeros for calendar periods', () => {
    const sessions = buildTrainingStats([], { dimension: 'group', period: 'session', anchor: null, threshold: 8, now });
    expect(sessions).toMatchObject({ period: null, items: [], history: [], olderId: null, newerId: null });

    const days = buildTrainingStats([], { dimension: 'group', period: 'day', anchor: null, threshold: 8, now });
    expect(days.period?.id).toBe('2026-09-28');
    expect(days.summary.sets).toBe(0);
    expect(days.history.every((bar) => bar.sets === 0)).toBe(true);
    expect(days.olderId).toBeNull();
  });

  it('counts sets with missing or negative values without adding volume', () => {
    const stats = buildTrainingStats([
      row({ reps: null, addedLoadKg: 20 }),
      row({ exerciseId: 'hold', metric: 'time', durationSec: -5 }),
      row({ rpe: 7.5 }),
    ], { dimension: 'exercise', period: 'day', anchor: null, threshold: 8, now });
    expect(stats.summary).toEqual({ sets: 3, setsAtThreshold: 0, reps: 10, holdSeconds: 0, loadRepsKg: 0, loadSecondsKg: 0 });
  });

  it('counts only sets at or above the RPE threshold when filtering', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'group', period: 'week', anchor: null, threshold: 9, rpeOnly: true, now });
    expect(stats.summary.sets).toBe(2);
    expect(stats.items.map((item) => [item.id, item.metrics.sets])).toEqual([['vertical-pull', 2]]);
    expect(stats.history[stats.history.length - 1].sets).toBe(2);
    expect(stats.history[stats.history.length - 2].sets).toBe(0);
    expect(stats.olderId).toBe('2026-09-21');
  });

  it('keeps every session navigable when filtering by RPE', () => {
    const older = buildTrainingStats(weekRows, { dimension: 'group', period: 'session', anchor: 'w0', threshold: 8, rpeOnly: true, now });
    expect(older.period?.id).toBe('w0');
    expect(older.summary.sets).toBe(0);
    expect(older.newerId).toBe('w1');
    const latest = buildTrainingStats(weekRows, { dimension: 'group', period: 'session', anchor: null, threshold: 8, rpeOnly: true, now });
    expect(latest.history.map((bar) => bar.sets)).toEqual([0, 3]);
  });
});

describe('scope', () => {
  const rows = [
    row({ category: 'push' }),
    row({ exerciseId: 'a', exerciseName: 'Active stretch', metric: 'time', category: 'mobility', mobilityMode: 'active', movementTags: '["Hip flexion"]', reps: null, durationSec: 30 }),
    row({ exerciseId: 'p', exerciseName: 'Passive split', metric: 'time', category: 'skill', extraCategories: '["mobility"]', mobilityMode: 'passive', movementTags: '["Hip flexion"]', reps: null, durationSec: 60 }),
    row({ exerciseId: 'u', exerciseName: 'Unclassified', metric: 'time', category: 'mobility', movementTags: '["Hip flexion"]', reps: null, durationSec: 10 }),
  ];
  const run = (scope: 'all' | 'strength' | 'mobility' | 'mobility-active' | 'mobility-passive') => buildTrainingStats(rows, { dimension: 'tag', period: 'week', anchor: null, threshold: 8, scope, now });

  it('splits strength from mobility and mobility by mode', () => {
    expect(run('all').summary.sets).toBe(4);
    expect(run('strength').summary.sets).toBe(1);
    expect(run('mobility').summary.sets).toBe(3);
    expect(run('mobility-active').summary.holdSeconds).toBe(30);
    expect(run('mobility-passive').summary.holdSeconds).toBe(60);
  });

  it('adds up mobility volume under each tag', () => {
    const hip = run('mobility').items.find((item) => item.id === 'Hip flexion');
    expect(hip?.metrics).toMatchObject({ sets: 3, holdSeconds: 100 });
  });
});
