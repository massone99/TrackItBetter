import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, addSet, copyValuesToSet, getActiveWorkout, getPreviousPerformance, repeatWorkout, repeatWorkoutIfIdle, setSetKind, startWorkout, updateEntryNote, updateSet, updateSetNote, updateSetRpe } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

let finishedId = '';

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
  finishedId = await startWorkout('Upper A');
  const pull = await addExerciseToWorkout(finishedId, 'pull-up');
  const { id: warm } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(pull) as { id: string };
  await setSetKind(warm, 'warmup');
  await updateSet(warm, 'reps', 3);
  const work = await addSet(pull);
  await setSetKind(work, 'working');
  await updateSet(work, 'reps', 6);
  await updateSet(work, 'addedLoadKg', 15);
  await updateSetRpe(work, 8.5);
  await updateSetNote(work, 'Presa stretta');
  await updateSet(work, 'restSec', 150);
  const skipped = await addSet(pull); // never completed: not repeated
  await updateEntryNote(pull, 'Scapole attive');
  await addExerciseToWorkout(finishedId, 'push-up'); // no completed set: not repeated
  real.sqlite.prepare('UPDATE training_set SET completed_at = 5 WHERE id IN (?, ?)').run(warm, work);
  real.sqlite.prepare('UPDATE workout SET ended_at = started_at + 1 WHERE id = ?').run(finishedId);
  expect(skipped).toBeTruthy();
});

describe('previous values', () => {
  it('include the set note', async () => {
    const previous = await getPreviousPerformance(['pull-up'], 'none');
    expect(previous.get('pull-up')?.sets).toEqual([{ pairId: null, side: 'both', reps: 6, durationSec: null, distanceM: null, addedLoadKg: 15, rpe: 8.5, note: 'Presa stretta', restSec: 150, formRating: null }]);
  });

  it('are copied onto a set, note included', async () => {
    const workoutId = await startWorkout('Copy');
    const entryId = await addExerciseToWorkout(workoutId, 'pull-up');
    const { id } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await copyValuesToSet(id, { reps: 6, durationSec: null, distanceM: null, addedLoadKg: 15, rpe: 8.5, note: 'Presa stretta' });
    const [set] = (await getActiveWorkout(workoutId))!.exercises[0].sets;
    expect(set).toMatchObject({ reps: 6, addedLoadKg: 15, rpe: 8.5, note: 'Presa stretta', completedAt: null });
    real.sqlite.prepare('DELETE FROM workout WHERE id = ?').run(workoutId);
  });
});

describe('repeatWorkout', () => {
  it('starts a new workout with the completed sets, kinds, rest and notes, nothing completed', async () => {
    const newId = await repeatWorkout(finishedId);
    const workout = await getActiveWorkout(newId);
    expect(workout?.name).toBe('Upper A');
    expect(workout?.exercises.map((exercise) => [exercise.exerciseId, exercise.notes])).toEqual([['pull-up', 'Scapole attive']]);
    expect(workout?.exercises[0].sets.map(({ index, kind, reps, addedLoadKg, rpe, note, restSec, completedAt }) => ({ index, kind, reps, addedLoadKg, rpe, note, restSec, completedAt }))).toEqual([
      { index: 1, kind: 'warmup', reps: 3, addedLoadKg: 0, rpe: null, note: null, restSec: null, completedAt: null },
      { index: 2, kind: 'working', reps: 6, addedLoadKg: 15, rpe: 8.5, note: 'Presa stretta', restSec: 150, completedAt: null },
    ]);
  });
});

describe('repeatWorkoutIfIdle', () => {
  it('does not start a second workout while one is open, and says which one', async () => {
    const open = await startWorkout('Still going');
    const result = await repeatWorkoutIfIdle(finishedId);
    expect(result).toEqual({ active: { id: open, name: 'Still going' } });
    real.sqlite.prepare('DELETE FROM workout WHERE id = ?').run(open);
  });
});
