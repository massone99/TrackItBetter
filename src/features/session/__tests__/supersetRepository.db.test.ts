import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, getActiveWorkout, linkWithNext, setSupersetRest, startWorkout, unlinkEntry } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

const groups = async (workoutId: string) => (await getActiveWorkout(workoutId))!.exercises.map((exercise) => [exercise.groupId, exercise.groupType]);

describe('supersets', () => {
  it('links exercises with the next one, sets the rest mode and unlinks them', async () => {
    const workoutId = await startWorkout('Superset');
    const a = await addExerciseToWorkout(workoutId, 'push-up');
    const b = await addExerciseToWorkout(workoutId, 'pull-up');
    const c = await addExerciseToWorkout(workoutId, 'push-up');
    const d = await addExerciseToWorkout(workoutId, 'pull-up');

    await linkWithNext(a);
    await linkWithNext(b);
    const [[group, type], second, third, fourth] = await groups(workoutId);
    expect(group).toBeTruthy();
    expect(type).toBe('superset');
    expect(second).toEqual([group, 'superset']);
    expect(third).toEqual([group, 'superset']);
    expect(fourth).toEqual([null, null]);

    await setSupersetRest(group!, { mode: 'between', betweenSec: 30 });
    expect((await groups(workoutId)).slice(0, 3).map(([, value]) => value)).toEqual(Array(3).fill('superset:between:30'));

    await unlinkEntry(c);
    await unlinkEntry(b);
    // A superset of one is no superset.
    expect(await groups(workoutId)).toEqual([[null, null], [null, null], [null, null], [null, null]]);
    expect(d).toBeTruthy();
  });
});
