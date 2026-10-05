import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, addSet, setSetKind, startWorkout } from '../../session/repository';
import { countPoseCapturesBySet, countPoseCapturesForExercise, getSetLink, linkPoseCapture, listLinkableSets, listPoseCaptures } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  Directory: function MockDirectory() { return {}; },
  File: function MockFile(_parent: never, fileName: string) { return { uri: `file:///${fileName}` }; },
}));
const { mockReal: real } = jest.requireMock('../../../db/client');

let workoutId = '';
let warmup = '';
let working = '';

function insertCapture(id: string, exerciseId: string | null, setId: string | null) {
  real.sqlite.prepare(`INSERT INTO pose_capture (id, position_id, side, value, level, keypoints, file_name, width, height, media_kind, note, captured_at, exercise_id, set_id)
    VALUES (?, 'free', NULL, 90, 0, '[]', ?, 100, 100, 'frame', '', ?, ?, ?)`).run(id, `${id}.jpg`, Date.now(), exerciseId, setId);
}

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
  workoutId = await startWorkout('Pull');
  const entry = await addExerciseToWorkout(workoutId, 'pull-up');
  warmup = (real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entry) as { id: string }).id;
  await setSetKind(warmup, 'warmup');
  working = await addSet(entry);
  await setSetKind(working, 'working');
  real.sqlite.prepare('UPDATE training_set SET completed_at = 5 WHERE id = ?').run(working);
  insertCapture('linked', 'pull-up', working);
  insertCapture('loose', null, null);
});

describe('pose analyses linked to sets', () => {
  it('reads the link with the exercise, the set number and the workout', async () => {
    const [capture] = await listPoseCaptures('free', { setId: working });
    expect(capture.id).toBe('linked');
    expect(capture.link).toMatchObject({ exerciseId: 'pull-up', set: { id: working, number: 1, workoutId } });
    expect((await listPoseCaptures('free')).find((item) => item.id === 'loose')?.link).toBeNull();
    expect(await getSetLink(working)).toMatchObject({ exerciseId: 'pull-up', set: { id: working, number: 1 } });
  });

  it('lists the sets of recent workouts, numbering working sets only', async () => {
    const sets = await listLinkableSets('pull-up');
    expect(sets.map((set) => [set.id, set.number, set.done])).toEqual([[warmup, null, false], [working, 1, true]]);
  });

  it('counts analyses per set and per exercise, and changes or removes a link', async () => {
    expect((await countPoseCapturesBySet(workoutId)).get(working)).toBe(1);
    expect(await countPoseCapturesForExercise('pull-up')).toBe(1);
    await linkPoseCapture('loose', { exerciseId: 'pull-up', setId: null });
    expect(await countPoseCapturesForExercise('pull-up')).toBe(2);
    await linkPoseCapture('loose', null);
    expect(await countPoseCapturesForExercise('pull-up')).toBe(1);
  });

  it('keeps the exercise link when the set is deleted', async () => {
    real.sqlite.prepare('DELETE FROM training_set WHERE id = ?').run(working);
    const capture = (await listPoseCaptures('free')).find((item) => item.id === 'linked');
    expect(capture?.link).toMatchObject({ exerciseId: 'pull-up', set: null });
  });
});
