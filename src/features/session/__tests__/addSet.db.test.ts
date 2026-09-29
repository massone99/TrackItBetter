import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, addSet, getActiveWorkout, getPreviousPerformance, replaceEntryExercise, setEntryRest, setSetKind, startWorkout, updateSet, updateSetNote, updateSetRpe } from '../repository';

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

describe('warm-up sets', () => {
  it('marks a set as warm-up, clearing its rest so the warm-up rest applies, and new sets follow the previous kind', async () => {
    const workoutId = await startWorkout('Warm-up');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    const { id: firstId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await updateSet(firstId, 'restSec', 120);

    await setSetKind(firstId, 'warmup');
    const secondId = await addSet(entryId);

    const kinds = real.sqlite.prepare('SELECT id, kind, rest_sec FROM training_set WHERE entry_id = ? ORDER BY set_index').all(entryId);
    expect(kinds).toEqual([{ id: firstId, kind: 'warmup', rest_sec: null }, { id: secondId, kind: 'warmup', rest_sec: null }]);
    const workout = await getActiveWorkout(workoutId);
    expect(workout?.exercises[0].sets.map((set) => set.kind)).toEqual(['warmup', 'warmup']);

    await setSetKind(secondId, 'working');
    expect((await getActiveWorkout(workoutId))?.exercises[0].sets.map((set) => set.kind)).toEqual(['warmup', 'working']);
  });

  it('leaves warm-ups out of the previous performance', async () => {
    const workoutId = await startWorkout('Old');
    const entryId = await addExerciseToWorkout(workoutId, 'pull-up');
    const { id: warmId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await updateSet(warmId, 'reps', 3);
    await setSetKind(warmId, 'warmup');
    const workId = await addSet(entryId);
    await setSetKind(workId, 'working');
    await updateSet(workId, 'reps', 9);
    real.sqlite.prepare('UPDATE training_set SET completed_at = 1 WHERE entry_id = ?').run(entryId);
    real.sqlite.prepare('UPDATE workout SET ended_at = started_at + 1 WHERE id = ?').run(workoutId);

    const previous = await getPreviousPerformance(['pull-up'], 'other');
    expect(previous.get('pull-up')?.sets.map((set) => set.reps)).toEqual([9]);
  });
});

describe('setEntryRest', () => {
  it('sets the rest of the open sets of one kind only', async () => {
    const workoutId = await startWorkout('Rest');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    const { id: warmId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await setSetKind(warmId, 'warmup');
    const doneId = await addSet(entryId);
    await setSetKind(doneId, 'working');
    const openId = await addSet(entryId);
    real.sqlite.prepare('UPDATE training_set SET completed_at = 1 WHERE id = ?').run(doneId);

    await setEntryRest(entryId, 'working', 150);

    const rows = real.sqlite.prepare('SELECT id, rest_sec FROM training_set WHERE entry_id = ? ORDER BY set_index').all(entryId);
    expect(rows).toEqual([{ id: warmId, rest_sec: null }, { id: doneId, rest_sec: null }, { id: openId, rest_sec: 150 }]);
  });
});

describe('replaceEntryExercise', () => {
  it('swaps the exercise of an entry and keeps sets of the same measure', async () => {
    const workoutId = await startWorkout('Swap');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    const { id: setId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await updateSet(setId, 'reps', 12);
    await updateSetNote(setId, 'tenuta');

    await replaceEntryExercise(entryId, 'pull-up');

    const [exercise] = (await getActiveWorkout(workoutId))!.exercises;
    expect(exercise.exerciseId).toBe('pull-up');
    expect(exercise.sets[0]).toMatchObject({ reps: 12, note: 'tenuta' });
  });

  it('turns reps into a default hold when the new exercise is timed, and drops the load', async () => {
    const workoutId = await startWorkout('Swap timed');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    const { id: setId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await updateSet(setId, 'reps', 12);
    await updateSet(setId, 'addedLoadKg', 5);
    const [timed] = real.sqlite.prepare("SELECT id FROM exercise WHERE metric = 'time' LIMIT 1").all() as { id: string }[];

    await replaceEntryExercise(entryId, timed.id);

    expect(real.sqlite.prepare('SELECT reps, duration_sec, added_load_kg FROM training_set WHERE id = ?').get(setId)).toEqual({ reps: null, duration_sec: 10, added_load_kg: 0 });
  });
});
