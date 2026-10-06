import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, completeSet, finishWorkout, getActiveWorkout, startWorkout, updateCompletedWorkoutSet, updateSet } from '../../session/repository';
import { getExerciseWeekStats, getSessionRecords } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

async function workoutWithOneSet(name: string, reps: number) {
  const workoutId = await startWorkout(name);
  await addExerciseToWorkout(workoutId, 'push-up');
  const [set] = (await getActiveWorkout(workoutId))!.exercises[0].sets;
  await updateSet(set.id, 'reps', reps);
  await completeSet(set.id);
  return { workoutId, setId: set.id };
}

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
  const first = await workoutWithOneSet('Before', 10);
  await finishWorkout(first.workoutId);
});

describe('finished-history cache', () => {
  it('is not reloaded by sets of the workout in progress, and is once the workout finishes', async () => {
    const select = jest.spyOn(real.db, 'select');
    expect((await getExerciseWeekStats('push-up', 'reps')).sets).toBe(1);

    const live = await workoutWithOneSet('Live', 12);
    await updateSet(live.setId, 'reps', 14);
    select.mockClear();
    expect((await getExerciseWeekStats('push-up', 'reps')).sets).toBe(1);
    expect(select).not.toHaveBeenCalled();

    // Records of the workout in progress still see its live sets.
    expect((await getSessionRecords(live.workoutId)).sets.length).toBeGreaterThan(0);

    await finishWorkout(live.workoutId);
    select.mockClear();
    expect((await getExerciseWeekStats('push-up', 'reps')).sets).toBe(2);
    expect(select).toHaveBeenCalled();

    // Editing a finished workout reloads it too.
    await updateCompletedWorkoutSet(live.workoutId, live.setId, 'reps', 20);
    select.mockClear();
    await getExerciseWeekStats('push-up', 'reps');
    expect(select).toHaveBeenCalled();
    select.mockRestore();
  });
});
