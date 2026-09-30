import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, getActiveWorkout, linkWithNext, moveExerciseEntry, startWorkout } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => { await migrateDatabase(real.expo); await seedCatalogIfEmpty(real.db); });
beforeEach(() => { real.sqlite.prepare('DELETE FROM workout').run(); });

async function build() {
  const workoutId = await startWorkout('W');
  const entries = [];
  for (const exerciseId of ['push-up', 'pull-up', 'chin-up', 'parallel-bar-dip']) entries.push(await addExerciseToWorkout(workoutId, exerciseId));
  return { workoutId, entries };
}
const order = async (workoutId: string) => (await getActiveWorkout(workoutId))!.exercises.map((exercise) => exercise.exerciseId);

describe('moveExerciseEntry', () => {
  it('moves an exercise to a new position and keeps the rest in order', async () => {
    const { workoutId, entries } = await build();
    await moveExerciseEntry(workoutId, entries[3], 0);
    expect(await order(workoutId)).toEqual(['parallel-bar-dip', 'push-up', 'pull-up', 'chin-up']);
    await moveExerciseEntry(workoutId, entries[0], 3);
    expect(await order(workoutId)).toEqual(['parallel-bar-dip', 'pull-up', 'chin-up', 'push-up']);
  });

  it('ignores a move to the same place and clamps out-of-range positions', async () => {
    const { workoutId, entries } = await build();
    await moveExerciseEntry(workoutId, entries[1], 1);
    await moveExerciseEntry(workoutId, entries[0], 99);
    expect(await order(workoutId)).toEqual(['pull-up', 'chin-up', 'parallel-bar-dip', 'push-up']);
  });

  it('takes an exercise out of its superset when it moves away from it, dissolving a pair', async () => {
    const { workoutId, entries } = await build();
    await linkWithNext(entries[0]);
    await moveExerciseEntry(workoutId, entries[1], 3);
    const groups = (await getActiveWorkout(workoutId))!.exercises.map((exercise) => exercise.groupId);
    expect(groups.every((group) => group === null)).toBe(true);
  });

  it('keeps a superset when it moves as a neighbour pair would stay together', async () => {
    const { workoutId, entries } = await build();
    await linkWithNext(entries[0]);
    await moveExerciseEntry(workoutId, entries[2], 0);
    const workout = (await getActiveWorkout(workoutId))!;
    expect(workout.exercises.map((exercise) => exercise.exerciseId)).toEqual(['chin-up', 'push-up', 'pull-up', 'parallel-bar-dip']);
    expect(workout.exercises[1].groupId).not.toBeNull();
    expect(workout.exercises[1].groupId).toBe(workout.exercises[2].groupId);
  });
});
