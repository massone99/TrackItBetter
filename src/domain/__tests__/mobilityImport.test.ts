import { prescriptionsFromSteps, stepsFromWorkout, summarizeImport, type ImportExerciseInfo } from '../mobilityImport';

const info = new Map<string, ImportExerciseInfo>([
  ['pigeon', { mobility: true, metric: 'time', unilateral: true }],
  ['catcow', { mobility: true, metric: 'reps', unilateral: false }],
  ['squat', { mobility: false, metric: 'reps_load', unilateral: false }],
]);
const ex = (exerciseId: string, sets: number, target: number | null, restSeconds: number | null = null) => ({ exerciseId, sets, target, restSeconds });

describe('mobility import', () => {
  it('rates a workout as full, partial or none', () => {
    expect(summarizeImport([ex('pigeon', 3, 45), ex('catcow', 2, 10)], info).compatibility).toBe('full');
    expect(summarizeImport([ex('pigeon', 3, 45), ex('squat', 3, 5)], info)).toEqual({ compatibility: 'partial', mobility: 1, total: 2 });
    expect(summarizeImport([ex('squat', 3, 5)], info).compatibility).toBe('none');
    expect(summarizeImport([], info).compatibility).toBe('none');
  });

  it('keeps only mobility drills, turning sets into rounds and targets into holds or reps', () => {
    let n = 0;
    const steps = stepsFromWorkout([ex('pigeon', 3, 45, 20), ex('squat', 3, 5), ex('catcow', 2, 12)], info, () => `id${n++}`);
    expect(steps).toEqual([
      { id: 'id0', exerciseId: 'pigeon', mode: 'hold', seconds: 45, reps: 10, perSide: true, rounds: 3, restSec: 20 },
      { id: 'id1', exerciseId: 'catcow', mode: 'reps', seconds: 30, reps: 12, perSide: false, rounds: 2, restSec: 0 },
    ]);
  });

  it('clamps out-of-range values and fills open targets', () => {
    const [hold, reps] = stepsFromWorkout([ex('pigeon', 20, 2, 900), ex('catcow', 1, null)], info, () => 'x');
    expect(hold).toMatchObject({ seconds: 5, rounds: 10, restSec: 300 });
    expect(reps).toMatchObject({ reps: 10 });
  });
});

describe('prescriptionsFromSteps', () => {
  it('turns drills into prescribed exercises: rounds to sets, hold seconds or reps as target', () => {
    let n = 0;
    expect(prescriptionsFromSteps([
      { id: 'a', exerciseId: 'pigeon', mode: 'hold', seconds: 45, reps: 10, perSide: true, rounds: 3, restSec: 20 },
      { id: 'b', exerciseId: 'catcow', mode: 'reps', seconds: 30, reps: 12, perSide: false, rounds: 2, restSec: 0 },
    ], () => `p${n++}`)).toEqual([
      { id: 'p0', exerciseId: 'pigeon', sets: 3, target: 45, restSeconds: 20 },
      { id: 'p1', exerciseId: 'catcow', sets: 2, target: 12, restSeconds: 0 },
    ]);
  });
});
