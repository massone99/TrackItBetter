import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { getTrainingStatsRows } from '../../analytics/repository';
import { addExerciseToWorkout, addSet, completeSet, finishWorkout, getActiveWorkout, startWorkout, switchEntryExercise, undoSwitch, updateSet, updateSetRpe } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

type Row = { id: string; entry_id: string; set_index: number; reps: number | null; duration_sec: number | null; rpe: number | null; completed_at: number | null };
const setsOf = (entryId: string) => real.sqlite.prepare('SELECT id, entry_id, set_index, reps, duration_sec, rpe, completed_at FROM training_set WHERE entry_id = ? ORDER BY set_index').all(entryId) as Row[];
const entries = (workoutId: string) => real.sqlite.prepare('SELECT id, exercise_id, "order" FROM exercise_entry WHERE workout_id = ? ORDER BY "order"').all(workoutId) as { id: string; exercise_id: string; order: number }[];

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});
beforeEach(() => { real.sqlite.prepare('DELETE FROM workout').run(); });

async function threeSets() {
  const workoutId = await startWorkout('Switch');
  const first = await addExerciseToWorkout(workoutId, 'pull-up', false);
  const other = await addExerciseToWorkout(workoutId, 'push-up', false);
  const second = await addSet(first);
  const third = await addSet(first);
  const [open] = setsOf(first);
  await updateSet(open.id, 'reps', 5);
  await updateSet(second, 'reps', 4);
  await updateSet(third, 'reps', 3);
  await completeSet(open.id);
  await updateSetRpe(open.id, 9.5);
  return { workoutId, first, other, ids: [open.id, second, third] };
}

describe('switching an exercise in a workout in progress', () => {
  it('keeps the sets already done on the exercise they were done on and moves the rest to the new one', async () => {
    const { workoutId, first, other, ids } = await threeSets();
    const result = await switchEntryExercise(first, 'scapular-pull-up');
    expect(result.keptEntryId).not.toBeNull();
    expect(entries(workoutId).map((entry) => entry.exercise_id)).toEqual(['pull-up', 'scapular-pull-up', 'push-up']);
    expect(entries(workoutId).map((entry) => entry.order)).toEqual([1, 2, 3]);
    const kept = setsOf(result.keptEntryId!);
    expect(kept.map((row) => [row.id, row.set_index, row.reps, row.completed_at !== null])).toEqual([[ids[0], 1, 5, true]]);
    expect(setsOf(first).map((row) => [row.id, row.set_index, row.reps, row.completed_at])).toEqual([[ids[1], 1, 4, null], [ids[2], 2, 3, null]]);
    expect(entries(workoutId)[2].id).toBe(other);
    const finished = await getActiveWorkout();
    expect(finished?.exercises.map((exercise) => exercise.exerciseId)).toEqual(['pull-up', 'scapular-pull-up', 'push-up']);
  });

  it('keeps the history of the left exercise once the workout is finished', async () => {
    const { workoutId, first } = await threeSets();
    await switchEntryExercise(first, 'scapular-pull-up');
    await finishWorkout(workoutId);
    const rows = await getTrainingStatsRows();
    const reps = (exerciseId: string) => rows.filter((row) => row.exerciseId === exerciseId).reduce((sum, row) => sum + (row.reps ?? 0), 0);
    expect(reps('pull-up')).toBe(5);
    expect(reps('scapular-pull-up')).toBe(0);
  });

  it('adapts the sets left when the measure changes, and starts a set when none were left', async () => {
    const { workoutId, first, ids } = await threeSets();
    await completeSet(ids[1]);
    await completeSet(ids[2]);
    const result = await switchEntryExercise(first, 'dead-hang');
    expect(setsOf(result.keptEntryId!).map((row) => row.reps)).toEqual([5, 4, 3]);
    const left = setsOf(first);
    expect(left).toHaveLength(1);
    expect(left[0].completed_at).toBeNull();
    expect(entries(workoutId)[1].exercise_id).toBe('dead-hang');
  });

  it('is a plain replacement when nothing was done, and does nothing for the same exercise', async () => {
    const workoutId = await startWorkout('Plain');
    const entry = await addExerciseToWorkout(workoutId, 'pull-up', false);
    expect((await switchEntryExercise(entry, 'pull-up')).keptEntryId).toBeNull();
    expect((await switchEntryExercise(entry, 'scapular-pull-up')).keptEntryId).toBeNull();
    expect(entries(workoutId).map((row) => row.exercise_id)).toEqual(['scapular-pull-up']);
  });

  it('is undone exactly: the exercise, the sets, their numbers and the order', async () => {
    const { workoutId, first, ids } = await threeSets();
    const before = { entries: entries(workoutId), sets: setsOf(first) };
    const snapshot = await switchEntryExercise(first, 'dead-hang');
    await undoSwitch(snapshot);
    expect(entries(workoutId)).toEqual(before.entries);
    expect(setsOf(first)).toEqual(before.sets);
    expect(setsOf(first).map((row) => row.id)).toEqual(ids);
    const second = await switchEntryExercise(first, 'scapular-pull-up');
    await undoSwitch(second);
    expect(setsOf(first)).toEqual(before.sets);
  });
});
