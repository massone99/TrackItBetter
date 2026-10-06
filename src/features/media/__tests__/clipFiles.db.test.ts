import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { formCheckVideos } from '../../../db/schema';
import { addExerciseToWorkout, addSet, discardRemoved, getActiveWorkout, removeSetWithUndo, restoreRemoved, startWorkout } from '../../session/repository';
import { sweepOrphanClipFiles } from '../formVideos';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
// The clip directory as a map of file name to last modification time.
jest.mock('expo-file-system', () => {
  const files = new Map<string, number>();
  class MockFile {
    name: string;
    constructor(_parent: unknown, fileName: string) { this.name = fileName; }
    get uri() { return `file:///clips/${this.name}`; }
    get exists() { return files.has(this.name); }
    get lastModified() { return files.get(this.name) ?? null; }
    get creationTime() { return null; }
    delete() { files.delete(this.name); }
  }
  class MockDirectory {
    get exists() { return true; }
    create() {}
    list() { return [...files.keys()].map((name) => new MockFile(null, name)); }
  }
  return { Paths: { document: 'documents' }, File: MockFile, Directory: MockDirectory, mockFiles: files };
});
const { mockReal: real } = jest.requireMock('../../../db/client');
const { mockFiles: files } = jest.requireMock('expo-file-system') as { mockFiles: Map<string, number> };

const DAY = 86_400_000;
let workoutId = '';

async function clipOn(setId: string, fileName: string) {
  files.set(fileName, Date.now() - DAY);
  await real.db.insert(formCheckVideos).values({ id: fileName, fileName, workoutId, exerciseId: 'push-up', setId, durationMs: 5000, fileSize: 10, recordedAt: new Date() });
}

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
  workoutId = await startWorkout('Clips');
  await addExerciseToWorkout(workoutId, 'push-up');
});

beforeEach(() => files.clear());

describe('clip files', () => {
  it('sweeps only old files that no clip refers to', async () => {
    const [set] = (await getActiveWorkout(workoutId))!.exercises[0].sets;
    await clipOn(set.id, 'kept.mp4');
    files.set('orphan.mp4', Date.now() - DAY);
    files.set('fresh.mp4', Date.now());
    expect(await sweepOrphanClipFiles()).toBe(1);
    expect([...files.keys()].sort()).toEqual(['fresh.mp4', 'kept.mp4']);
  });

  it('keeps the files of a removal while it can be undone, then deletes them', async () => {
    const entryId = (await getActiveWorkout(workoutId))!.exercises[0].entryId;
    const setId = await addSet(entryId);
    await clipOn(setId, 'undo.mp4');

    const removed = await removeSetWithUndo(setId);
    expect(await sweepOrphanClipFiles()).toBe(0);
    expect(files.has('undo.mp4')).toBe(true);

    // Restored, then the toast hides: the file is in use again and stays.
    await restoreRemoved(removed!);
    await discardRemoved(removed);
    expect(files.has('undo.mp4')).toBe(true);

    // Removed for good: the file goes when the undo is no longer offered.
    const again = await removeSetWithUndo(setId);
    expect(files.has('undo.mp4')).toBe(true);
    await discardRemoved(again);
    expect(files.has('undo.mp4')).toBe(false);
  });
});
