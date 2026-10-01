import { aggregatePairs } from '../../../domain/setPairs';
import { buildProgressSnapshot, type CompletedSetRow } from '../summary';
import { buildTrainingStats, type StatsSetRow } from '../trainingStats';
import { computeMetric } from '../explore';
import { mobilitySecondsForWorkout } from '../mobility';
import { repsAtLoadFromExplore } from '../repsAtLoad';

const date = new Date('2026-10-02T12:00:00Z');
const base: CompletedSetRow = {
  workoutId: 'w', workoutStartedAt: date, completedAt: date, bodyweightKg: null,
  exerciseId: 'e', exerciseName: 'Split squat', category: 'legs', movementPattern: 'squat',
  metric: 'reps_load', leverageFactor: null, setId: 'l', pairId: 'p', side: 'left',
  reps: 10, durationSec: null, distanceM: null, addedLoadKg: 20, rpe: 7,
};
const sides = [base, { ...base, setId: 'r', side: 'right', reps: 8, addedLoadKg: 15, rpe: 9 }];

it('uses real side contributions consistently in summaries, explorer and threshold statistics', () => {
  const snapshot = buildProgressSnapshot(sides, date);
  expect(snapshot.completedSets).toBe(1);
  expect(snapshot.volume.loadRepsKg).toBe(160);
  expect(snapshot.volume.reps).toBe(9);
  expect(computeMetric('loadReps', sides, [])).toBe(160);
  expect(computeMetric('bestE1rm', sides, [])).toBeCloseTo((20 * (1 + 10 / 30) + 15 * (1 + 8 / 30)) / 2);
  const rows: StatsSetRow[] = sides.map((s) => ({ ...s, pairMembers: undefined, workoutName: 'Workout', movementGroup: 'squat', movementTag: null, rpe: s.rpe ?? null }));
  const options = { dimension: 'exercise' as const, period: 'session' as const, anchor: 'w', threshold: 8.5 };
  expect(buildTrainingStats(rows, options).summary).toMatchObject({ sets: 1, setsAtThreshold: 0, loadRepsKg: 160 });
  expect(buildTrainingStats(rows, { ...options, rpeOnly: true }).summary.sets).toBe(0);
  expect(computeMetric('setsAtRpe', [{ ...sides[0], rpe: null }, sides[1]], [], 8)).toBe(0);
});

it('keeps actual best pairs, hold volume and distance averages', () => {
  const other = sides.map((s, i) => ({ ...s, pairId: 'q', setId: `q${i}`, reps: i === 0 ? 18 : 2 }));
  expect(computeMetric('bestReps', [...sides, ...other], [])).toBe(10);
  const holds = sides.map((s, i) => ({ ...s, metric: 'time_load', category: 'mobility', reps: null, durationSec: i === 0 ? 30 : 20, addedLoadKg: i === 0 ? 10 : 20 }));
  expect(computeMetric('loadSec', holds, [])).toBe(350);
  expect(mobilitySecondsForWorkout(holds, 'w')).toBe(25);
  const distances = sides.map((s, i) => ({ ...s, metric: 'distance', distanceM: i === 0 ? 100 : 80 }));
  expect(computeMetric('distanceM', distances, [])).toBe(90);
});

it('excludes mixed-load average comparisons and preserves assistance in side comparisons', () => {
  const data = { rows: sides, workouts: [] };
  const scope = { kind: 'all' as const, exerciseId: 'e' };
  expect(repsAtLoadFromExplore(data, scope)).toEqual([]);
  const assisted = sides.map((s, i) => ({ ...s, addedLoadKg: i === 0 ? -5 : 0 }));
  expect(repsAtLoadFromExplore({ ...data, rows: aggregatePairs(assisted, 'left') }, scope)[0].loadKg).toBe(-5);
  expect(repsAtLoadFromExplore({ ...data, rows: aggregatePairs(assisted, 'right') }, scope)[0].loadKg).toBe(0);
});
