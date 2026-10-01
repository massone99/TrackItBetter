import { createCustomExercise, updateExercise, type CreateCustomExerciseInput } from '../customRepository';

const writes: { kind: 'update' | 'insert'; values: Record<string, unknown> }[] = [];
jest.mock('../../../db/client', () => ({
  initializeDatabase: jest.fn(),
  db: {
    update: () => ({ set: (values: Record<string, unknown>) => { writes.push({ kind: 'update', values }); return { where: async () => undefined }; } }),
    insert: () => ({ values: async (values: Record<string, unknown>) => { writes.push({ kind: 'insert', values }); } }),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));

const input: CreateCustomExerciseInput = {
  name: '  Tuck Planche ',
  metric: 'time',
  category: 'skill',
  extraCategories: ['push', 'core'],
  equipment: ['floor'],
  cues: ['Lean forward'],
  demoUrl: 'https://youtu.be/x',
  movementTag: 'Shoulder flexion',
  movementGroup: 'horizontal-push',
};

beforeEach(() => { writes.length = 0; });

describe('updateExercise', () => {
  it('writes every editable field, extra categories and classification included', async () => {
    await updateExercise('tuck-planche', input);
    expect(writes).toEqual([{ kind: 'update', values: {
      name: 'Tuck Planche',
      metric: 'time',
      category: 'skill',
      extraCategories: '["push","core"]',
      equipment: '["floor"]',
      cues: '["Lean forward"]',
      demoUrl: 'https://youtu.be/x',
      movementTag: 'Shoulder flexion',
      movementTags: '["Shoulder flexion"]',
      movementGroup: 'horizontal-push',
    } }]);
  });

  it('clears classification and extra categories when they are removed', async () => {
    await updateExercise('tuck-planche', { ...input, extraCategories: [], movementTag: null, movementGroup: null });
    expect(writes[0].values).toMatchObject({ extraCategories: '[]', movementTag: null, movementGroup: null });
  });

  it('never stores the main category among the extras', async () => {
    await updateExercise('tuck-planche', { ...input, extraCategories: ['skill', 'push', 'push'] });
    expect(writes[0].values.extraCategories).toBe('["push"]');
  });

  it('rejects an unknown movement tag or group without writing', async () => {
    await expect(updateExercise('x', { ...input, movementTag: 'Made up' })).rejects.toThrow(RangeError);
    await expect(updateExercise('x', { ...input, movementGroup: 'rotation' as never })).rejects.toThrow(RangeError);
    expect(writes).toEqual([]);
  });
});

describe('createCustomExercise', () => {
  it('stores extra categories and classification of a new exercise', async () => {
    await expect(createCustomExercise(input)).resolves.toBe('uuid-1');
    expect(writes[0].values).toMatchObject({ id: 'uuid-1', name: 'Tuck Planche', extraCategories: '["push","core"]', movementGroup: 'horizontal-push', isCustom: true });
  });
});
