import { detectWorkoutRecords, type CompletedSetRow } from '../summary';

function row(overrides: Partial<CompletedSetRow>): CompletedSetRow {
  return {
    workoutId: 'w1',
    workoutStartedAt: new Date('2026-09-01T10:00:00Z'),
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
    completedAt: new Date('2026-09-01T10:05:00Z'),
    ...overrides,
  };
}

const later = { workoutId: 'w2', workoutStartedAt: new Date('2026-09-03T10:00:00Z'), completedAt: new Date('2026-09-03T10:05:00Z') };

describe('detectWorkoutRecords', () => {
  it('reports the best set that beats earlier workouts, with the previous best', () => {
    const records = detectWorkoutRecords([row({ reps: 8 }), row({ ...later, reps: 9 }), row({ ...later, reps: 10 })], 'w2');
    expect(records).toEqual([{ exerciseId: 'pull-up', exerciseName: 'Pull-up', kind: 'reps', value: 10, previous: 8 }]);
  });

  it('ignores ties and first-ever attempts', () => {
    expect(detectWorkoutRecords([row({ reps: 8 }), row({ ...later, reps: 8 })], 'w2')).toEqual([]);
    expect(detectWorkoutRecords([row({ reps: 8 })], 'w1')).toEqual([]);
  });

  it('does not compare against workouts that started later', () => {
    const records = detectWorkoutRecords([row({ reps: 10 }), row({ ...later, reps: 20 })], 'w1');
    expect(records).toEqual([]);
  });

  it('tracks holds and added load separately', () => {
    const base = { exerciseId: 'l-sit', exerciseName: 'Weighted L-sit', metric: 'time_load', reps: null };
    const records = detectWorkoutRecords([
      row({ ...base, durationSec: 20, addedLoadKg: 5 }),
      row({ ...base, ...later, durationSec: 15, addedLoadKg: 7.5 }),
    ], 'w2');
    expect(records).toEqual([{ exerciseId: 'l-sit', exerciseName: 'Weighted L-sit', kind: 'load', value: 7.5, previous: 5 }]);
  });
});
