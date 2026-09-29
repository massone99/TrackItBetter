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

const backup = (data: object) => JSON.stringify({ format: 'trackitbetter-backup', version: 2, exportedAt: '2026-09-27T10:00:00.000Z', data });

describe('parseBackup', () => {
  it('accepts backups made before pose captures existed', () => {
    expect(() => parseBackup(backup(emptyData))).not.toThrow();
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
});
