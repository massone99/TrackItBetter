import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, completeSet, finishWorkout, startWorkout, updateSet } from '../../session/repository';
import { getExerciseHistory } from '../../analytics/repository';
import { saveUserProgram, listUserPrograms } from '../../programs/userPrograms';
import { canTransfer, deleteExerciseWithHistory, getExerciseUsage, hideExercise, metricAfterTransfer, transferExerciseHistory } from '../lifecycle';
import { getExerciseById, listExercises } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
jest.mock('../../media/formVideos', () => ({ deleteFormCheckVideosForSets: jest.fn(async () => undefined) }));
const mockPrefs = new Map<string, string>();
jest.mock('../../../shared/settings/preferences', () => ({
  readPreference: (key: string) => mockPrefs.get(key) ?? null,
  writePreference: (key: string, value: string) => { mockPrefs.set(key, value); },
}));
const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});
beforeEach(() => { real.sqlite.prepare('DELETE FROM workout').run(); mockPrefs.clear(); });

/** A finished workout with one set of `exerciseId`. */
async function logSet(exerciseId: string, reps: number, load = 0): Promise<string> {
  const workoutId = await startWorkout('W');
  const entryId = await addExerciseToWorkout(workoutId, exerciseId);
  const { id } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
  await updateSet(id, 'reps', reps);
  if (load) await updateSet(id, 'addedLoadKg', load);
  for (const row of real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').all(entryId) as { id: string }[]) await completeSet(row.id);
  await finishWorkout(workoutId);
  return workoutId;
}

describe('exercise history', () => {
  it('lists finished sessions with their sets, newest first', async () => {
    await logSet('pull-up', 5);
    await logSet('pull-up', 7);
    const history = await getExerciseHistory('pull-up');
    expect(history).toHaveLength(2);
    expect(history[0].sets[0].reps).toBe(7);
    expect(await getExerciseHistory('pull-up', 1)).toHaveLength(1);
  });
});

describe('transferring history', () => {
  it('only pairs exercises measured the same way, and keeps load visible', () => {
    expect(canTransfer('reps_load', 'reps')).toBe(true);
    expect(canTransfer('reps', 'time')).toBe(false);
    expect(metricAfterTransfer('reps', true)).toBe('reps_load');
    expect(metricAfterTransfer('reps', false)).toBe('reps');
    expect(metricAfterTransfer('time', true)).toBe('time_load');
  });

  it('moves sets, program movements and rest to the destination and can delete the source', async () => {
    await logSet('weighted-pull-up', 5, 20);
    await saveUserProgram({ name: 'P', sessions: [{ id: 's', name: 'A', exercises: [{ id: 'e', exerciseId: 'weighted-pull-up', sets: 3, target: 5, restSeconds: null }] }] });
    mockPrefs.set('rest.exercise.weighted-pull-up.working', '180');
    mockPrefs.set('progress.trends', JSON.stringify({ exerciseIds: ['weighted-pull-up', 'dip'], limit: 5 }));

    await transferExerciseHistory('weighted-pull-up', 'chin-up', { deleteSource: true });

    const history = await getExerciseHistory('chin-up');
    expect(history[0].sets[0]).toMatchObject({ reps: 5, addedLoadKg: 20 });
    expect((await getExerciseById('chin-up'))?.metric).toBe('reps_load');
    expect(await getExerciseById('weighted-pull-up')).toBeNull();
    expect((await listUserPrograms())[0].sessions[0].exercises[0].exerciseId).toBe('chin-up');
    expect(mockPrefs.get('rest.exercise.chin-up.working')).toBe('180');
    expect(JSON.parse(mockPrefs.get('progress.trends')!).exerciseIds).toEqual(['chin-up', 'dip']);
  });

  it('keeps the source when asked, and refuses different measures', async () => {
    await logSet('push-up', 10);
    await transferExerciseHistory('push-up', 'diamond-push-up', { deleteSource: false });
    expect(await getExerciseById('push-up')).not.toBeNull();
    expect((await getExerciseUsage('push-up')).sets).toBe(0);
    expect((await getExerciseUsage('diamond-push-up')).sets).toBe(1);
    await expect(transferExerciseHistory('push-up', 'tuck-planche', { deleteSource: false })).rejects.toThrow();
  });
});

describe('removing an exercise', () => {
  it('hides it and keeps its history', async () => {
    await logSet('archer-pull-up', 4);
    await hideExercise('archer-pull-up');
    expect((await listExercises()).some((exercise) => exercise.id === 'archer-pull-up')).toBe(false);
    expect(await getExerciseHistory('archer-pull-up')).toHaveLength(1);
  });

  it('deletes it with its sets, and workouts left empty', async () => {
    const workoutId = await logSet('ring-dip', 6);
    await deleteExerciseWithHistory('ring-dip');
    expect(await getExerciseById('ring-dip')).toBeNull();
    expect(real.sqlite.prepare('SELECT COUNT(*) c FROM workout WHERE id = ?').get(workoutId)).toEqual({ c: 0 });
  });
});
