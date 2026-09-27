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

  it('accepts backups with pose captures', () => {
    const parsed = parseBackup(backup({ ...emptyData, poseCaptures: [capture] }));
    expect('poseCaptures' in parsed.data && parsed.data.poseCaptures?.[0].level).toBe(4);
  });

  it('rejects invalid pose captures before touching the database', () => {
    expect(() => parseBackup(backup({ ...emptyData, poseCaptures: [{ ...capture, level: 9 }] }))).toThrow();
    expect(() => parseBackup(backup({ ...emptyData, poseCaptures: [{ ...capture, fileName: '../escape.jpg' }] }))).toThrow();
  });
});
