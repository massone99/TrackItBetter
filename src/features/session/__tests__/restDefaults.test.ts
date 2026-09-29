import { readExerciseRest, restForSet, writeDefaultRest, writeExerciseRest } from '../restDefaults';

const mockStore = new Map<string, string>();
jest.mock('../../../shared/settings/preferences', () => ({
  readPreference: (key: string) => mockStore.get(key) ?? null,
  writePreference: (key: string, value: string) => mockStore.set(key, value),
}));

beforeEach(() => mockStore.clear());

describe('rest defaults', () => {
  it('uses 90 s for working sets and 60 s for warm-ups out of the box', () => {
    expect(readExerciseRest('dip', 'working')).toBe(90);
    expect(readExerciseRest('dip', 'warmup')).toBe(60);
  });

  it('prefers the exercise setting over the global default, separately per kind', () => {
    writeDefaultRest('working', 120);
    writeDefaultRest('warmup', 45);
    writeExerciseRest('dip', 'warmup', 30);
    expect(readExerciseRest('dip', 'working')).toBe(120);
    expect(readExerciseRest('dip', 'warmup')).toBe(30);
    expect(readExerciseRest('pull-up', 'warmup')).toBe(45);
  });

  it("uses a set's own rest when it has one", () => {
    writeExerciseRest('dip', 'working', 150);
    expect(restForSet('dip', { kind: 'working', restSec: 75 })).toBe(75);
    expect(restForSet('dip', { kind: 'working', restSec: null })).toBe(150);
    expect(restForSet('dip', { kind: 'warmup', restSec: null })).toBe(60);
  });
});
