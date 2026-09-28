import { buildTrainingTotals, dateFromLocalKey, localDateKey, type TrainingExercise, type TrainingSetRecord } from '../trainingTotals';

const exercises: TrainingExercise[] = [
  { id: 'timed', name: 'Hold', metric: 'time', movementTag: 'shoulder-extension', movementGroup: 'horizontal-push' },
  { id: 'reps', name: 'Push up', metric: 'reps', movementTag: null, movementGroup: 'horizontal-push' },
  { id: 'empty', name: 'Empty', metric: 'time_load', movementTag: 'unused', movementGroup: 'hinge' },
];

function set(exerciseId: string, date: string, durationSec: number | null, rpe: number | null, kind = 'working'): TrainingSetRecord {
  return { exerciseId, workoutStartedAt: dateFromLocalKey(date), durationSec, rpe, kind };
}

describe('buildTrainingTotals', () => {
  it('sums local selected day and inclusive prior six days, with threshold counts and all catalog rows', () => {
    const sets = [
      set('timed', '2026-03-02', 9, 8), // inclusive seven-day boundary
      set('timed', '2026-03-07', 11, 7.5),
      set('timed', '2026-03-08', 13, 9), // selected date
      set('reps', '2026-03-08', null, null), // unrated does not pass threshold
      set('reps', '2026-03-01', 30, 10), // outside rolling window
    ];
    const result = buildTrainingTotals(exercises, sets, ['shoulder-extension', 'unused', 'zero'], dateFromLocalKey('2026-03-08'), 8);

    expect(result.dailyHoldSeconds).toBe(13);
    expect(result.weeklyHoldSeconds).toBe(33);
    expect(result.tags).toEqual([
      { id: 'shoulder-extension', dailyHoldSeconds: 13, weeklyHoldSeconds: 33 },
      { id: 'unused', dailyHoldSeconds: 0, weeklyHoldSeconds: 0 },
      { id: 'zero', dailyHoldSeconds: 0, weeklyHoldSeconds: 0 },
    ]);
    expect(result.exercises.find((item) => item.id === 'timed')).toMatchObject({ daily: 1, weekly: 3, dailyAtThreshold: 1, weeklyAtThreshold: 2 });
    expect(result.exercises.find((item) => item.id === 'reps')).toMatchObject({ daily: 1, weekly: 1, dailyAtThreshold: 0, weeklyAtThreshold: 0 });
    expect(result.exercises.find((item) => item.id === 'empty')).toMatchObject({ daily: 0, weekly: 0 });
    expect(result.groups.find((item) => item.id === 'horizontal-push')).toMatchObject({ daily: 2, weekly: 4, dailyAtThreshold: 1, weeklyAtThreshold: 2 });
    expect(result.groups.find((item) => item.id === 'hinge')).toMatchObject({ daily: 0, weekly: 0 });
  });

  it('uses local date keys rather than UTC day boundaries', () => {
    const date = new Date(2026, 0, 2, 23, 59);
    expect(localDateKey(date)).toBe('2026-01-02');
    const totals = buildTrainingTotals(exercises, [set('timed', '2026-01-02', 5, 6)], [], date, 6);
    expect(totals.exercises[0]).toMatchObject({ daily: 1, weekly: 1, dailyAtThreshold: 1, weeklyAtThreshold: 1 });
  });

  it('includes completed timed warmups in hold time, while set counts include only working sets', () => {
    const sets = [
      set('timed', '2026-03-08', 12, null, 'warmup'),
      set('timed', '2026-03-08', 20, 8, 'working'),
      set('reps', '2026-03-08', null, 9, 'working'), // completed working set with no timed duration
    ];
    const result = buildTrainingTotals(exercises, sets, ['shoulder-extension'], dateFromLocalKey('2026-03-08'), 8);

    expect(result.dailyHoldSeconds).toBe(32);
    expect(result.tags[0]).toMatchObject({ dailyHoldSeconds: 32, weeklyHoldSeconds: 32 });
    expect(result.exercises.find((item) => item.id === 'timed')).toMatchObject({ daily: 1, dailyAtThreshold: 1 });
    expect(result.exercises.find((item) => item.id === 'reps')).toMatchObject({ daily: 1, dailyAtThreshold: 1 });
    expect(result.groups.find((item) => item.id === 'horizontal-push')).toMatchObject({ daily: 2, dailyAtThreshold: 2 });
  });

  it('applies each supported RPE threshold, excluding unrated sets', () => {
    const rpes = [5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, null];
    const sets = rpes.map((rpe) => set('reps', '2026-03-08', null, rpe));
    for (let threshold = 6; threshold <= 10; threshold += 0.5) {
      const result = buildTrainingTotals(exercises, sets, [], dateFromLocalKey('2026-03-08'), threshold);
      expect(result.exercises.find((item) => item.id === 'reps')?.dailyAtThreshold).toBe(rpes.filter((rpe) => rpe != null && rpe >= threshold).length);
    }
  });

  it('reclassifies historical holds and sets using the exercise current tag and group', () => {
    const history = [
      set('timed', '2026-03-08', 15, 8),
      set('timed', '2026-03-07', 25, 9),
    ];
    const original = buildTrainingTotals(exercises, history, ['shoulder-extension', 'hip-extension'], dateFromLocalKey('2026-03-08'), 8);
    const reclassified = buildTrainingTotals(
      exercises.map((exercise) => exercise.id === 'timed' ? { ...exercise, movementTag: 'hip-extension', movementGroup: 'hinge' } : exercise),
      history,
      ['shoulder-extension', 'hip-extension'],
      dateFromLocalKey('2026-03-08'),
      8,
    );

    expect(original.tags).toEqual([
      { id: 'shoulder-extension', dailyHoldSeconds: 15, weeklyHoldSeconds: 40 },
      { id: 'hip-extension', dailyHoldSeconds: 0, weeklyHoldSeconds: 0 },
    ]);
    expect(reclassified.tags).toEqual([
      { id: 'shoulder-extension', dailyHoldSeconds: 0, weeklyHoldSeconds: 0 },
      { id: 'hip-extension', dailyHoldSeconds: 15, weeklyHoldSeconds: 40 },
    ]);
    expect(original.groups.find((item) => item.id === 'horizontal-push')).toMatchObject({ daily: 1, weekly: 2 });
    expect(original.groups.find((item) => item.id === 'hinge')).toMatchObject({ daily: 0, weekly: 0 });
    expect(reclassified.groups.find((item) => item.id === 'horizontal-push')).toMatchObject({ daily: 0, weekly: 0 });
    expect(reclassified.groups.find((item) => item.id === 'hinge')).toMatchObject({ daily: 1, weekly: 2 });
  });
});
