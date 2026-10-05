import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { listRecentMicroSessionExerciseIds, logMicroSession } from '../microSession';
import { listRecentWorkouts } from '../repository';

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
