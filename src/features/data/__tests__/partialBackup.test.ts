import { createBackup, parseBackup } from '../backup';
import * as client from '../../../db/client';
import { exerciseEntries, exercises, levelCriteria, progressionChains, trainingSets, workouts } from '../../../db/schema';

// jest.mock calls are hoisted above the import by babel-jest.
jest.mock('../../../db/client', () => ({ db: {}, initializeDatabase: jest.fn() }));
jest.mock('../../photos/repository', () => ({ getProgressPhotoFile: jest.fn(), preparePhotoDirectory: jest.fn() }));
jest.mock('../../pose/repository', () => ({ getPoseCaptureFile: jest.fn(), preparePoseCaptureDirectory: jest.fn() }));
jest.mock('../../media/formVideos', () => ({ getFormCheckVideoFile: jest.fn() }));

const created = new Date('2026-01-01T00:00:00Z');
const exercise = (id: string, chainId: string | null = null) => ({
  id, name: id, aliases: '[]', metric: 'reps', category: 'push', movementPattern: null, primaryMuscles: '[]', secondaryMuscles: '[]',
  equipment: '[]', unilateral: false, chainId, level: null, leverageFactor: null, cues: '[]', demoUrl: null, isCustom: false,
  favourite: false, archived: false, createdAt: created,
});
const workout = (id: string, day: string) => ({
  id, name: id, startedAt: new Date(`${day}T10:00:00Z`), endedAt: new Date(`${day}T11:00:00Z`),
  notes: null, sleep: null, energy: null, soreness: null, sessionRpe: null, bodyweightKg: null,
});
const set = (id: string, entryId: string) => ({
  id, entryId, index: 1, kind: 'working', reps: 5, durationSec: null, distanceM: null, addedLoadKg: 20, band: null, rpe: null,
  rir: null, side: 'both', tempo: null, restSec: null, note: null, completedAt: created,
});

const rows = new Map<unknown, unknown[]>([
  [exercises, [exercise('dip'), exercise('pull-up', 'pull'), exercise('unused')]],
  [progressionChains, [{ id: 'pull', name: 'Pull', description: '', family: 'pull' }, { id: 'push', name: 'Push', description: '', family: 'push' }]],
  [levelCriteria, [{ id: 'pull-1', chainId: 'pull', level: 1, target: '{}', requiredSessions: 1 }, { id: 'push-1', chainId: 'push', level: 1, target: '{}', requiredSessions: 1 }]],
  [workouts, [workout('old', '2026-08-01'), workout('in', '2026-09-28')]],
  [exerciseEntries, [
    { id: 'e-old', workoutId: 'old', exerciseId: 'dip', order: 0, groupId: null, groupType: null, notes: null },
    { id: 'e-in', workoutId: 'in', exerciseId: 'pull-up', order: 0, groupId: null, groupType: null, notes: 'Elastico verde' },
  ]],
  [trainingSets, [set('s-old', 'e-old'), set('s-in', 'e-in')]],
]);
(client.db as unknown as { select: () => { from: (table: unknown) => Promise<unknown[]> } }).select = () => ({
  from: async (table) => rows.get(table) ?? [],
});

describe('partial backups', () => {
  it('exports only workouts in the range with the exercises and chains they use', async () => {
    const backup = await createBackup({ kind: 'workouts', from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-30T23:59:59Z') });
    expect(backup.data.workouts.map(({ id }) => id)).toEqual(['in']);
    expect(backup.data.exerciseEntries.map(({ notes }) => notes)).toEqual(['Elastico verde']);
    expect(backup.data.trainingSets.map(({ id }) => id)).toEqual(['s-in']);
    expect(backup.data.exercises.map(({ id }) => id)).toEqual(['pull-up']);
    expect(backup.data.levelCriteria.map(({ id }) => id)).toEqual(['pull-1']);
    expect(backup.data.settings).toEqual([]);
    expect(() => parseBackup(JSON.stringify(backup))).not.toThrow();
  });

  it('exports the library without history', async () => {
    const backup = await createBackup({ kind: 'library' });
    expect(backup.data.exercises).toHaveLength(3);
    expect(backup.data.progressionChains).toHaveLength(2);
    expect(backup.data.workouts).toEqual([]);
    expect(backup.data.trainingSets).toEqual([]);
  });
});
