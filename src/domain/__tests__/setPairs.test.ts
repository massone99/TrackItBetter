import { aggregatePairs, completedSetCount, realMean, recordScope } from '../setPairs';
import { sessionFromWorkout } from '../userProgram';
import { buildTrainingStats, type StatsSetRow } from '../../features/analytics/trainingStats';

type SetRow = {
  id: string;
  pairId?: string | null;
  side: 'left' | 'right' | 'both';
  entryId: string;
  kind: 'working' | 'warmup';
  reps: number | null;
  addedLoadKg: number;
  rpe: number | null;
  completedAt: Date | null;
};

const pair = (id: string, side: 'left' | 'right' | 'both', reps: number, load: number, rpe: number | null = 8): SetRow => ({
  id,
  pairId: 'pair-1',
  side,
  entryId: 'entry-1',
  kind: 'working',
  reps,
  addedLoadKg: load,
  rpe,
  completedAt: new Date(),
});

describe('pair aggregation', () => {
  it('retains both sides so nonlinear volume is averaged from real contributions', () => {
    const average = aggregatePairs([pair('left', 'left', 10, 20), pair('right', 'right', 8, 15)])[0];
    expect(average).toMatchObject({ side: 'average', reps: 9, addedLoadKg: 17.5 });
    expect(realMean(average, (set) => (set.reps ?? 0) * set.addedLoadKg)).toBe(160);
  });

  it('keeps pair RPE unknown unless both sides report it', () => {
    const average = aggregatePairs([pair('left', 'left', 10, 20, 8), pair('right', 'right', 8, 15, null)])[0];
    expect(average.rpe).toBeNull();
    expect(realMean(average, (set) => set.rpe)).toBeNull();
  });

  it('counts a complete pair once, while legacy and unlinked side rows keep their old counts', () => {
    const rows: SetRow[] = [
      pair('paired-left', 'left', 10, 20),
      pair('paired-right', 'right', 8, 15),
      { ...pair('legacy', 'both', 12, 0), pairId: null },
      { ...pair('unlinked-left', 'left', 8, 10), pairId: null },
      { ...pair('unlinked-right', 'right', 8, 10), pairId: null },
    ];
    expect(completedSetCount(rows)).toBe(4);
    expect(recordScope(rows[0])).toBe('left');
    expect(recordScope(rows[2])).toBe('legacy');
  });

  it('keeps side and average scopes distinct and omits an incomplete pair from average', () => {
    const complete = [pair('left', 'left', 10, 20), pair('right', 'right', 8, 15)];
    const incomplete = [
      { ...pair('open-left', 'left', 10, 20), pairId: 'pair-2' },
      { ...pair('open-right', 'right', 8, 15), pairId: 'pair-2', completedAt: null },
    ];
    expect(aggregatePairs([...complete, ...incomplete]).map(({ id }) => id)).toEqual(['left']);
    expect(aggregatePairs(complete, 'left').map(({ id }) => id)).toEqual(['left']);
    expect(aggregatePairs(complete, 'right').map(({ id }) => id)).toEqual(['right']);
  });

  it('builds a three-pair program session from six side rows', () => {
    const session = sessionFromWorkout('Legs', [{
      exerciseId: 'weighted-unilateral',
      metric: 'reps_load',
      notes: null,
      sets: [1, 2, 3].flatMap((index) => [
        { pairId: `pair-${index}`, side: 'left', kind: 'working', reps: 10, durationSec: null, distanceM: null, addedLoadKg: 20, restSec: null },
        { pairId: `pair-${index}`, side: 'right', kind: 'working', reps: 8, durationSec: null, distanceM: null, addedLoadKg: 15, restSec: null },
      ]),
    }], () => 'id');
    expect(session.exercises[0].sets).toBe(3);
    expect(session.exercises[0].target).toBe(10);
    expect(session.exercises[0].loadKg).toBe(20);
  });

  it('counts an asymmetric pair once in training stats and averages real load-reps', () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    const rows: StatsSetRow[] = [
      { ...statsRow('left', 'left', 10, 20, now), pairId: 'pair-1' },
      { ...statsRow('right', 'right', 8, 15, now), pairId: 'pair-1' },
    ];
    const stats = buildTrainingStats(rows, { dimension: 'exercise', period: 'session', anchor: 'workout-1', threshold: 8, now });
    expect(stats.summary).toMatchObject({ sets: 1, reps: 9, loadRepsKg: 160 });
  });
});

function statsRow(id: string, side: 'left' | 'right', reps: number, addedLoadKg: number, date: Date): StatsSetRow {
  return {
    pairId: null,
    side,
    workoutId: 'workout-1',
    workoutName: 'Stats',
    workoutStartedAt: date,
    exerciseId: 'weighted-unilateral',
    exerciseName: 'Weighted unilateral',
    metric: 'reps_load',
    movementGroup: 'squat',
    movementTag: null,
    reps,
    durationSec: null,
    addedLoadKg,
    rpe: 8,
  };
}
