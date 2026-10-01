import { parseBackup } from '../backup';

// jest.mock calls are hoisted above the import by babel-jest.
jest.mock('../../../db/client', () => ({ db: {}, initializeDatabase: jest.fn() }));
jest.mock('../../photos/repository', () => ({ getProgressPhotoFile: jest.fn(), preparePhotoDirectory: jest.fn() }));
jest.mock('../../pose/repository', () => ({ getPoseCaptureFile: jest.fn(), preparePoseCaptureDirectory: jest.fn() }));
jest.mock('../../media/formVideos', () => ({ getFormCheckVideoFile: jest.fn() }));

const emptyData = {
  exercises: [], progressionChains: [], levelCriteria: [], workouts: [], exerciseEntries: [],
  trainingSets: [], bodyMeasurements: [], settings: [], progressPhotos: [],
};

const exercise = {
  id: 'push-up', name: 'Push-up', aliases: '[]', metric: 'reps', category: 'push',
  movementPattern: 'horizontal-push', primaryMuscles: '[]', secondaryMuscles: '[]', equipment: '[]',
  unilateral: false, chainId: null, level: null, leverageFactor: null, cues: '[]', demoUrl: null,
  isCustom: false, favourite: false, archived: false, createdAt: '2026-09-27T10:00:00.000Z',
};

const capture = {
  id: '3f1b6c1e-8d2a-4c5e-9a7b-1c2d3e4f5a6b',
  positionId: 'front_split',
  side: 'left',
  value: 162.4,
  level: 4,
  keypoints: '[]',
  fileName: '3f1b6c1e-8d2a-4c5e-9a7b-1c2d3e4f5a6b.jpg',
  width: 1080,
  height: 1440,
  mediaKind: 'photo',
  note: '',
  capturedAt: '2026-09-27T10:00:00.000Z',
  base64: 'AAAA',
};

const backup = (data: object, version = 2) => JSON.stringify({ format: 'trackitbetter-backup', version, exportedAt: '2026-09-27T10:00:00.000Z', data });

const workout = {
  id: 'workout-1', name: 'Workout', startedAt: '2026-09-27T10:00:00.000Z', endedAt: null,
  notes: null, sleep: null, energy: null, soreness: null, sessionRpe: null, bodyweightKg: null,
};

const entry = {
  id: 'entry-1', workoutId: 'workout-1', exerciseId: 'push-up', order: 0,
  groupId: null, groupType: null, notes: null,
};

const set = (id: string, side: 'left' | 'right', completedAt: string | null = null, pairId = 'pair-1') => ({
  id, entryId: 'entry-1', index: 1, kind: 'working', reps: 8, durationSec: null, distanceM: null,
  addedLoadKg: 0, band: null, rpe: null, rir: null, side, tempo: null, restSec: null, note: null,
  completedAt, pairId,
});

describe('parseBackup', () => {
  it('accepts backups made before pose captures existed', () => {
    expect(() => parseBackup(backup(emptyData))).not.toThrow();
  });

  it('accepts v1 backups and supplies defaults for unilateral fields', () => {
    const { progressPhotos: _photos, ...v1Data } = emptyData;
    const parsed = parseBackup(backup({ ...v1Data, exercises: [exercise] }, 1));
    expect(parsed.data.exercises[0].unilateralRestMode).toBe('pair');
  });

  it('accepts older exercises without movement classifications and new classified exercises', () => {
    expect(() => parseBackup(backup({ ...emptyData, exercises: [exercise] }))).not.toThrow();
    const parsed = parseBackup(backup({
      ...emptyData,
      exercises: [{ ...exercise, movementTag: 'Shoulder extension', movementGroup: 'horizontal-push' }],
    }));
    expect(parsed.data.exercises[0].movementGroup).toBe('horizontal-push');
  });

  it('accepts the shoulder alias but rejects tags outside the catalog', () => {
    expect(() => parseBackup(backup({
      ...emptyData,
      exercises: [{ ...exercise, movementTag: 'Shoulder extension + flexion' }],
    }))).not.toThrow();
    expect(() => parseBackup(backup({
      ...emptyData,
      exercises: [{ ...exercise, movementTag: 'unknown tag' }],
    }))).toThrow();
  });

  it('rejects a backup with an unknown movement group', () => {
    expect(() => parseBackup(backup({
      ...emptyData,
      exercises: [{ ...exercise, movementGroup: 'push-ish' }],
    }))).toThrow();
  });

  it('accepts backups with pose captures', () => {
    const parsed = parseBackup(backup({ ...emptyData, poseCaptures: [capture] }));
    expect('poseCaptures' in parsed.data && parsed.data.poseCaptures?.[0].level).toBe(4);
  });

  it('rejects invalid pose captures before touching the database', () => {
    expect(() => parseBackup(backup({ ...emptyData, poseCaptures: [{ ...capture, level: 9 }] }))).toThrow();
    expect(() => parseBackup(backup({ ...emptyData, poseCaptures: [{ ...capture, fileName: '../escape.jpg' }] }))).toThrow();
  });

  it('accepts a complete v3 pair and keeps side-specific values', () => {
    const parsed = parseBackup(backup({
      ...emptyData,
      exercises: [{ ...exercise, unilateralRestMode: 'side' }],
      workouts: [workout],
      exerciseEntries: [{ ...entry, unilateralRestMode: 'pair' }],
      trainingSets: [set('set-left', 'left'), { ...set('set-right', 'right'), reps: 10 }],
    }, 3));
    expect(parsed.data.exercises[0].unilateralRestMode).toBe('side');
    expect(parsed.data.exerciseEntries[0].unilateralRestMode).toBe('pair');
    expect(parsed.data.trainingSets.map(({ side, reps }) => [side, reps])).toEqual([['left', 8], ['right', 10]]);
  });

  it('rejects malformed and cross-entry pairs', () => {
    const base = {
      ...emptyData,
      exercises: [exercise],
      workouts: [workout],
      exerciseEntries: [entry],
    };
    expect(() => parseBackup(backup({ ...base, trainingSets: [set('set-left', 'left')] }, 3))).toThrow();
    expect(() => parseBackup(backup({ ...base, trainingSets: [set('set-left', 'left'), { ...set('set-right', 'right'), entryId: 'missing-entry' }] }, 3))).toThrow();
    expect(() => parseBackup(backup({ ...base, trainingSets: [set('set-left', 'left'), { ...set('set-right', 'right'), side: 'left' }] }, 3))).toThrow();
  });

  it('allows an unfinished pair in a draft but rejects one in an ended workout', () => {
    const draft = {
      ...emptyData,
      exercises: [exercise],
      workouts: [workout],
      exerciseEntries: [entry],
      trainingSets: [set('set-left', 'left', '2026-09-27T10:05:00.000Z'), set('set-right', 'right')],
    };
    expect(() => parseBackup(backup(draft, 3))).not.toThrow();
    expect(() => parseBackup(backup({
      ...draft,
      workouts: [{ ...workout, endedAt: '2026-09-27T11:00:00.000Z' }],
    }, 3))).toThrow();
  });
});
