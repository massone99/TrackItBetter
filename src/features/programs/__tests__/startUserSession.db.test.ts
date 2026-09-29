import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { createCustomExercise } from '../../exercises/customRepository';
import { getActiveWorkout } from '../../session/repository';
import { startUserProgramSession } from '../startUserSession';
import { getUserProgram, saveUserProgram } from '../userPrograms';

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

const custom = (name: string, metric: 'reps' | 'reps_load' | 'time' | 'distance') => createCustomExercise({
  name, category: 'push', extraCategories: [], metric, equipment: [], cues: [], demoUrl: null, movementTag: null, movementGroup: null,
});

describe('starting a workout from a program', () => {
  it('starts a program made of custom exercises of every measure', async () => {
    const ids = [await custom('My press', 'reps_load'), await custom('My hold', 'time'), await custom('My run', 'distance'), await custom('My reps', 'reps')];
    const saved = await saveUserProgram({
      name: 'Mine',
      sessions: [{ id: 's1', name: 'A', exercises: ids.map((exerciseId, index) => ({ id: `e${index}`, exerciseId, sets: 3, target: 10, restSeconds: 90, loadKg: index === 0 ? 20 : null })) }],
    });
    const program = (await getUserProgram(saved.id))!;

    const workoutId = await startUserProgramSession(program, program.sessions[0]);

    const workout = (await getActiveWorkout(workoutId))!;
    expect(workout.exercises).toHaveLength(4);
    expect(workout.exercises.every((exercise) => exercise.sets.length === 3)).toBe(true);
    expect(workout.exercises[0].sets[0]).toMatchObject({ addedLoadKg: 20, restSec: 90 });
    real.sqlite.prepare('DELETE FROM workout').run();
  });

  it('leaves no half-started workout behind when the program cannot be started', async () => {
    const program = { id: 'p', name: 'Broken', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [{ id: 'e', exerciseId: 'gone-exercise', sets: 3, target: 8, restSeconds: 90 }] }] };
    await expect(startUserProgramSession(program, program.sessions[0])).rejects.toThrow();
    expect(await getActiveWorkout()).toBeNull();
  });

  it('skips movements that no longer exist and starts with the rest', async () => {
    const program = { id: 'p2', name: 'Half', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [
      { id: 'e1', exerciseId: 'gone-exercise', sets: 3, target: 8, restSeconds: 90 },
      { id: 'e2', exerciseId: 'push-up', sets: 2, target: 8, restSeconds: 60 },
    ] }] };
    const workoutId = await startUserProgramSession(program, program.sessions[0]);
    expect((await getActiveWorkout(workoutId))!.exercises.map((exercise) => [exercise.exerciseId, exercise.sets.length])).toEqual([['push-up', 2]]);
  });
});
