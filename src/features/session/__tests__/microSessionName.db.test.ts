import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { listRecentMicroSessionExerciseIds, logMicroSession, startMicroSession, logMicroSessionItems } from '../microSession';
import { getActiveWorkout, listRecentWorkouts } from '../repository';

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
  // One saved before the naming change.
  real.sqlite.exec("INSERT INTO workout (id, name, started_at, ended_at) VALUES ('old', 'Grease the Groove', 1, 2); INSERT INTO exercise_entry (id, workout_id, exercise_id, \"order\") VALUES ('oe', 'old', 'pull-up', 1);");
});

describe('micro-session names', () => {
  it('numbers saved micro-sessions, counting the older ones too', async () => {
    await logMicroSession('push-up', 5);
    await logMicroSession('push-up', 5);
    const names = (await listRecentWorkouts()).map((workout) => workout.name);
    expect(names.slice(0, 2)).toEqual(['Mini-session 3', 'Mini-session 2']);
    expect(await listRecentMicroSessionExerciseIds()).toEqual(['push-up', 'pull-up']);
  });
});

describe('micro-session set details', () => {
  it('saves load and RPE like a workout set, and lets a bodyweight exercise track load', async () => {
    await logMicroSession('push-up', 6, { loadKg: 5, rpe: 7.5 });
    const row = real.sqlite.prepare(`
      SELECT s.reps, s.added_load_kg AS load, s.rpe, e.metric FROM training_set s
      JOIN exercise_entry en ON en.id = s.entry_id JOIN workout w ON w.id = en.workout_id JOIN exercise e ON e.id = en.exercise_id
      ORDER BY w.started_at DESC LIMIT 1`).get();
    expect(row).toEqual({ reps: 6, load: 5, rpe: 7.5, metric: 'reps_load' });
  });
});

describe('micro-session with several exercises', () => {
  it('saves one workout with each exercise\'s sets, kinds, RPE and form, in order', async () => {
    await logMicroSessionItems([{ exerciseId: 'pull-up', sets: [{ value: 3 }] }, { exerciseId: 'push-up', sets: [{ value: 5, kind: 'warmup' }, { value: 8, rpe: 6, formRating: 4 }] }]);
    const [latest] = await listRecentWorkouts(1);
    const rows = real.sqlite.prepare(`
      SELECT en.exercise_id AS exercise, s.kind, s.reps, s.rpe, s.form_rating AS form, s.completed_at IS NOT NULL AS done FROM exercise_entry en
      JOIN training_set s ON s.entry_id = en.id WHERE en.workout_id = ? ORDER BY en."order", s.set_index`).all(latest.id);
    expect(rows).toEqual([
      { exercise: 'pull-up', kind: 'working', reps: 3, rpe: null, form: null, done: 1 },
      { exercise: 'push-up', kind: 'warmup', reps: 5, rpe: null, form: null, done: 1 },
      { exercise: 'push-up', kind: 'working', reps: 8, rpe: 6, form: 4, done: 1 },
    ]);
  });

  it('writes nothing when one of the values is invalid', async () => {
    const before = (await listRecentWorkouts()).length;
    await expect(logMicroSessionItems([{ exerciseId: 'pull-up', sets: [{ value: 3 }] }, { exerciseId: 'push-up', sets: [{ value: 0 }] }])).rejects.toThrow(RangeError);
    expect((await listRecentWorkouts()).length).toBe(before);
  });
});

describe('startMicroSession', () => {
  it('starts an ordinary workout in progress with the chosen exercises at their practice targets, or returns the one already open', async () => {
    const started = await startMicroSession(['push-up', 'pull-up', 'push-up']);
    if (!('workoutId' in started)) throw new Error('expected a workout');
    const workout = (await getActiveWorkout(started.workoutId))!;
    expect(workout.name).toMatch(/^Mini-session \d+$/);
    expect(workout.exercises.map((exercise) => exercise.exerciseId)).toEqual(['push-up', 'pull-up']);
    expect(workout.exercises[0].sets[0]).toMatchObject({ reps: 3, completedAt: null });
    const again = await startMicroSession(['push-up']);
    expect(again).toEqual({ active: { id: started.workoutId, name: workout.name } });
    await expect(startMicroSession([])).rejects.toThrow();
    real.sqlite.prepare('DELETE FROM workout WHERE id = ?').run(started.workoutId);
  });
});
