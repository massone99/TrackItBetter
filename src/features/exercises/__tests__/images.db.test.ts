import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addImportedExerciseImages, listExerciseImages, moveExerciseImage, deleteExerciseImage } from '../images';
import { deleteExerciseWithHistory, transferExerciseHistory } from '../lifecycle';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const mockDeleted: string[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  Directory: function MockDirectory() { return { exists: true }; },
  File: function MockFile(_parent: never, fileName: string) { return { uri: `file:///${fileName}`, exists: true, delete: () => mockDeleted.push(fileName), create: () => undefined, write: () => undefined }; },
}));
jest.mock('../../photos/repository', () => ({ downscale: jest.fn() }));
const { mockReal: real } = jest.requireMock('../../../db/client');

function insertImage(id: string, exerciseId: string, position: number) {
  real.sqlite.prepare('INSERT INTO exercise_image (id, exercise_id, file_name, mime_type, width, height, position, created_at) VALUES (?, ?, ?, ?, 100, 100, ?, ?)')
    .run(id, exerciseId, `${id}.jpg`, 'image/jpeg', position, Date.now());
}

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

beforeEach(() => {
  real.sqlite.prepare('DELETE FROM exercise_image').run();
  mockDeleted.length = 0;
});

describe('exercise images', () => {
  it('lists in order, moves one place and deletes the row and its file', async () => {
    insertImage('a', 'pull-up', 0);
    insertImage('b', 'pull-up', 1);
    insertImage('c', 'pull-up', 2);
    insertImage('x', 'push-up', 0);
    expect((await listExerciseImages('pull-up')).map((image) => image.id)).toEqual(['a', 'b', 'c']);
    await moveExerciseImage('c', -1);
    expect((await listExerciseImages('pull-up')).map((image) => image.id)).toEqual(['a', 'c', 'b']);
    await moveExerciseImage('a', -1);
    expect((await listExerciseImages('pull-up')).map((image) => image.id)).toEqual(['a', 'c', 'b']);
    await deleteExerciseImage('c');
    expect((await listExerciseImages('pull-up')).map((image) => image.id)).toEqual(['a', 'b']);
    expect(mockDeleted).toEqual(['c.jpg']);
  });

  it('keeps pictures on the target when history moves, and deletes them with the exercise', async () => {
    insertImage('a', 'pull-up', 0);
    await transferExerciseHistory('pull-up', 'chin-up', { deleteSource: true });
    expect((await listExerciseImages('chin-up')).map((image) => image.id)).toEqual(['a']);
    await deleteExerciseWithHistory('chin-up');
    expect(await listExerciseImages('chin-up')).toEqual([]);
    expect(mockDeleted).toEqual(['a.jpg']);
  });

  it('adds imported pictures after the others and skips the ones an earlier import added', async () => {
    insertImage('a', 'push-up', 0);
    const one = { data: 'AAAABBBB', mimeType: 'image/jpeg' as const, width: 10, height: 20 };
    const two = { data: 'data:image/png;base64,CCCCDDDD', mimeType: 'image/png' as const, width: 30, height: 40 };
    expect(await addImportedExerciseImages('push-up', [one, two])).toBe(2);
    expect(await addImportedExerciseImages('push-up', [one, two, one])).toBe(0);
    const images = await listExerciseImages('push-up');
    expect(images.map((image) => [image.position, image.mimeType, image.width])).toEqual([[0, 'image/jpeg', 100], [1, 'image/jpeg', 10], [2, 'image/png', 30]]);
  });
});
