import {
  availableMetrics,
  buildBreakdown,
  buildSeries,
  computeMetric,
  matchesScope,
  nextLevel,
  periodStart,
  scopeOptions,
  type ExploreData,
  type ExploreWorkout,
} from '../explore';
import type { CompletedSetRow } from '../summary';

// Local-time dates keep bucketing assertions independent of the machine's time zone.
const at = (month: number, day: number, hour = 10) => new Date(2026, month - 1, day, hour);

function workout(id: string, startedAt: Date, extra: Partial<ExploreWorkout> = {}): ExploreWorkout {
  return { id, name: `Workout ${id}`, startedAt, endedAt: new Date(startedAt.getTime() + 60 * 60 * 1000), sessionRpe: null, sleep: null, energy: null, soreness: null, ...extra };
}

let setCounter = 0;
function set(workoutId: string, startedAt: Date, overrides: Partial<CompletedSetRow>): CompletedSetRow {
  setCounter += 1;
  return {
    workoutId,
    workoutStartedAt: startedAt,
    bodyweightKg: 70,
    exerciseId: 'pull-up',
    exerciseName: 'Pull-up',
    category: 'pull',
    movementPattern: 'vertical-pull',
    metric: 'reps',
    leverageFactor: null,
    setId: `s${setCounter}`,
    reps: 8,
    durationSec: null,
    distanceM: null,
    addedLoadKg: 0,
    completedAt: startedAt,
    rpe: null,
    ...overrides,
  };
}

const w1 = workout('w1', at(9, 21), { sessionRpe: 7, sleep: 4 });
const w2 = workout('w2', at(9, 24), { sessionRpe: 9 });
const w3 = workout('w3', at(8, 3));
const pushUp = { exerciseId: 'push-up', exerciseName: 'Push-up', category: 'push', movementPattern: 'horizontal-push' };
const pike = { exerciseId: 'pike-stretch', exerciseName: 'Pike stretch', category: 'mobility', movementPattern: 'hamstring-flexibility', metric: 'time', reps: null, durationSec: 60 };
const weightedPull = { exerciseId: 'weighted-pull-up', exerciseName: 'Weighted pull-up', metric: 'reps_load', addedLoadKg: 20, reps: 5 };

const data: ExploreData = {
  workouts: [w3, w1, w2],
  rows: [
    set('w1', w1.startedAt, { reps: 8, rpe: 7 }),
    set('w1', w1.startedAt, { reps: 6, rpe: 8 }),
    set('w1', w1.startedAt, { ...pushUp, reps: 20 }),
    set('w1', w1.startedAt, pike),
    set('w2', w2.startedAt, { reps: 10 }),
    set('w2', w2.startedAt, weightedPull),
    set('w2', w2.startedAt, { ...pike, durationSec: 90 }),
    set('w3', w3.startedAt, { ...pushUp, reps: 15 }),
  ],
};

const all = { kind: 'all' } as const;
const now = at(9, 28, 12); // Monday

describe('periodStart', () => {
  it('starts weeks on Monday and months on the first', () => {
    expect(periodStart(at(9, 27), 'week')).toEqual(new Date(2026, 8, 21));
    expect(periodStart(at(9, 28), 'week')).toEqual(new Date(2026, 8, 28));
    expect(periodStart(at(3, 1), 'week')).toEqual(new Date(2026, 1, 23));
    expect(periodStart(at(9, 27), 'month')).toEqual(new Date(2026, 8, 1));
    expect(periodStart(at(9, 27, 23), 'day')).toEqual(new Date(2026, 8, 27));
  });
});

describe('matchesScope', () => {
  it('separates strength from mobility and narrows by category, pattern and exercise', () => {
    const [pull, , push, stretch] = data.rows;
    expect(matchesScope(stretch, { kind: 'strength' })).toBe(false);
    expect(matchesScope(stretch, { kind: 'mobility' })).toBe(true);
    expect(matchesScope(pull, { kind: 'mobility' })).toBe(false);
    expect(matchesScope(set('w', at(1, 1), { category: 'cardio' }), { kind: 'strength' })).toBe(false);
    expect(matchesScope(push, { kind: 'all', category: 'pull' })).toBe(false);
    expect(matchesScope(pull, { kind: 'all', category: 'pull', pattern: 'vertical-pull', exerciseId: 'pull-up' })).toBe(true);
    expect(matchesScope(pull, { kind: 'all', pattern: 'horizontal-pull' })).toBe(false);
  });
});

describe('computeMetric', () => {
  const w1Rows = data.rows.filter((row) => row.workoutId === 'w1');

  it('counts sessions, sets and distinct exercises', () => {
    expect(computeMetric('sessions', data.rows, data.workouts)).toBe(3);
    expect(computeMetric('sets', w1Rows, [w1])).toBe(4);
    expect(computeMetric('exercises', w1Rows, [w1])).toBe(3);
  });

  it('keeps reps and hold time apart', () => {
    expect(computeMetric('reps', w1Rows, [w1])).toBe(34);
    expect(computeMetric('holdSec', w1Rows, [w1])).toBe(60);
    expect(computeMetric('mobilityHoldSec', data.rows, data.workouts)).toBe(150);
    expect(computeMetric('mobilitySets', data.rows, data.workouts)).toBe(2);
  });

  it('computes load volume and best-of values', () => {
    const w2Rows = data.rows.filter((row) => row.workoutId === 'w2');
    expect(computeMetric('loadReps', w2Rows, [w2])).toBe(100);
    expect(computeMetric('bestLoad', w2Rows, [w2])).toBe(20);
    expect(computeMetric('bestReps', w2Rows, [w2])).toBe(10);
    expect(computeMetric('bestE1rm', w2Rows, [w2])).toBeGreaterThan(20);
    expect(computeMetric('bestHold', [], [])).toBeNull();
  });

  it('averages set RPE and workout ratings, ignoring missing values', () => {
    expect(computeMetric('avgRpe', w1Rows, [w1])).toBe(7.5);
    expect(computeMetric('sessionRpe', data.rows, data.workouts)).toBe(8);
    expect(computeMetric('sleep', data.rows, data.workouts)).toBe(4);
    expect(computeMetric('energy', data.rows, data.workouts)).toBeNull();
  });

  it('sums training time of finished workouts', () => {
    expect(computeMetric('trainingSec', data.rows, [w1, w2])).toBe(7200);
    expect(computeMetric('trainingSec', [], [workout('open', at(9, 1), { endedAt: null })])).toBeNull();
  });
});

describe('RPE estimates', () => {
  it('takes the highest estimated max per bucket from rated bodyweight sets only', () => {
    const w1Rows = data.rows.filter((row) => row.workoutId === 'w1');
    expect(computeMetric('estMaxReps', w1Rows, [w1])).toBe(11);
    expect(computeMetric('estMaxReps', [set('w', at(1, 1), { ...weightedPull, rpe: 8 })], [])).toBeNull();
    expect(computeMetric('estMaxHold', [set('w', at(1, 1), { ...pike, durationSec: 40, rpe: 8 })], [])).toBe(50);
    expect(computeMetric('estMaxHold', w1Rows, [w1])).toBeNull();
  });

  it('offers estimates only when the exercise has rated sets', () => {
    expect(availableMetrics(data, { kind: 'all', exerciseId: 'pull-up' })).toContain('estMaxReps');
    expect(availableMetrics(data, { kind: 'all', exerciseId: 'pike-stretch' })).not.toContain('estMaxHold');
    expect(availableMetrics(data, all)).not.toContain('estMaxReps');
  });
});

describe('buildSeries', () => {
  it('fills every week of the page, including empty ones', () => {
    const { buckets, hasOlder } = buildSeries(data, { granularity: 'week', scope: all, metric: 'sets', now, page: 0 });
    expect(buckets).toHaveLength(12);
    expect(buckets[11].start).toEqual(new Date(2026, 8, 28));
    expect(buckets[11].value).toBe(0);
    expect(buckets[10].value).toBe(7);
    expect(buckets[10].workoutIds.sort()).toEqual(['w1', 'w2']);
    expect(buckets.find((bucket) => bucket.workoutIds.includes('w3'))?.value).toBe(1);
    expect(hasOlder).toBe(false);
  });

  it('gives best-of metrics null in empty periods', () => {
    const { buckets } = buildSeries(data, { granularity: 'day', scope: { kind: 'all', exerciseId: 'pull-up' }, metric: 'bestReps', now, page: 0 });
    expect(buckets).toHaveLength(30);
    expect(buckets.find((bucket) => bucket.key === '2026-09-21')?.value).toBe(8);
    expect(buckets.find((bucket) => bucket.key === '2026-09-24')?.value).toBe(10);
    expect(buckets.find((bucket) => bucket.key === '2026-09-22')?.value).toBeNull();
  });

  it('pages back through months and reports older data', () => {
    const recent = buildSeries(data, { granularity: 'month', scope: all, metric: 'sessions', now, page: 0 });
    expect(recent.buckets.map((bucket) => bucket.key).slice(-2)).toEqual(['2026-08', '2026-09']);
    expect(recent.buckets.slice(-2).map((bucket) => bucket.value)).toEqual([1, 2]);
    expect(recent.hasOlder).toBe(false);
    const daily = buildSeries(data, { granularity: 'day', scope: all, metric: 'sessions', now, page: 0 });
    expect(daily.hasOlder).toBe(true);
  });

  it('has one bucket per workout in scope', () => {
    const { buckets } = buildSeries(data, { granularity: 'workout', scope: { kind: 'mobility' }, metric: 'holdSec', now, page: 0 });
    expect(buckets.map((bucket) => [bucket.key, bucket.value])).toEqual([['w1', 60], ['w2', 90]]);
  });

  it('counts workout ratings only for workouts with sets in scope', () => {
    const { buckets } = buildSeries(data, { granularity: 'workout', scope: { kind: 'all', category: 'push' }, metric: 'sessionRpe', now, page: 0 });
    expect(buckets.map((bucket) => bucket.key)).toEqual(['w3', 'w1']);
    expect(buckets[1].value).toBe(7);
  });
});

describe('breakdown and scope options', () => {
  it('drills category, then pattern, then exercise', () => {
    expect(nextLevel(all)).toBe('category');
    expect(nextLevel({ kind: 'all', category: 'pull' })).toBe('pattern');
    expect(nextLevel({ kind: 'all', category: 'pull', pattern: 'vertical-pull' })).toBe('exercise');
    expect(nextLevel({ kind: 'all', exerciseId: 'pull-up' })).toBeNull();
  });

  it('splits additive metrics into shares', () => {
    const items = buildBreakdown(data, all, 'sets', { workoutIds: ['w1', 'w2'] });
    expect(items.map((item) => [item.key, item.value])).toEqual([['pull', 4], ['mobility', 2], ['push', 1]]);
    expect(items[0].share).toBeCloseTo(4 / 7);
  });

  it('names exercises and leaves shares out of best-of metrics', () => {
    const items = buildBreakdown(data, { kind: 'all', category: 'pull', pattern: 'vertical-pull' }, 'bestReps', { workoutIds: ['w2'] });
    expect(items.map((item) => item.name)).toEqual(['Pull-up', 'Weighted pull-up']);
    expect(items[0].share).toBeNull();
  });

  it('lists only trained choices within the parent scope', () => {
    expect(scopeOptions(data, { kind: 'strength' }, 'category').map((option) => option.key)).toEqual(['pull', 'push']);
    expect(scopeOptions(data, { kind: 'all', category: 'pull' }, 'exercise').map((option) => option.name)).toEqual(['Pull-up', 'Weighted pull-up']);
  });
});

describe('availableMetrics', () => {
  it('offers performance metrics only for one exercise', () => {
    expect(availableMetrics(data, all)).not.toContain('bestReps');
    expect(availableMetrics(data, { kind: 'all', exerciseId: 'weighted-pull-up' })).toEqual(expect.arrayContaining(['bestLoad', 'bestE1rm', 'loadReps']));
    expect(availableMetrics(data, { kind: 'all', exerciseId: 'pull-up' })).not.toContain('bestLoad');
  });

  it('hides metrics with no data and the mobility shortcut inside mobility scope', () => {
    const metrics = availableMetrics(data, all);
    expect(metrics).toEqual(expect.arrayContaining(['sessions', 'sets', 'reps', 'holdSec', 'mobilityHoldSec', 'avgRpe', 'sessionRpe', 'sleep', 'trainingSec']));
    expect(metrics).not.toContain('distanceM');
    expect(metrics).not.toContain('energy');
    expect(availableMetrics(data, { kind: 'mobility' })).not.toContain('mobilityHoldSec');
  });
});
