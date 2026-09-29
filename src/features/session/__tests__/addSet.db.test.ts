import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, addSet, startWorkout, updateSet, updateSetNote, updateSetRpe } from '../repository';

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

const setRow = (setId: string) => real.sqlite
  .prepare('SELECT reps, added_load_kg, rpe, note, rest_sec, completed_at FROM training_set WHERE id = ?')
  .get(setId);

describe('addSet', () => {
  it('copies reps, load, RPE, rest and note from the previous set, but not completion', async () => {
    const workoutId = await startWorkout('Test');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    const { id: firstId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await updateSet(firstId, 'reps', 6);
    await updateSet(firstId, 'addedLoadKg', 12.5);
    await updateSet(firstId, 'restSec', 120);
    await updateSetRpe(firstId, 8.5);
    await updateSetNote(firstId, 'Elastico verde');
    real.sqlite.prepare('UPDATE training_set SET completed_at = 1 WHERE id = ?').run(firstId);

    const secondId = await addSet(entryId);

    expect(setRow(secondId)).toEqual({ reps: 6, added_load_kg: 12.5, rpe: 8.5, note: 'Elastico verde', rest_sec: 120, completed_at: null });
  });
});
