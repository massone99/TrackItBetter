import { formatSupersetType, parseSupersetType, supersetStep } from '../superset';

type Ex = Parameters<typeof supersetStep>[0][number];
const ex = (entryId: string, groupId: string | null, open: number, groupType: string | null = 'superset'): Ex => ({
  entryId, groupId, groupType,
  sets: Array.from({ length: 3 }, (_, index) => ({ completedAt: index < 3 - open ? new Date() : null })),
});

describe('superset type', () => {
  it('round-trips both rest modes', () => {
    expect(parseSupersetType('superset')).toEqual({ mode: 'round', betweenSec: 0 });
    expect(parseSupersetType(formatSupersetType({ mode: 'between', betweenSec: 30 }))).toEqual({ mode: 'between', betweenSec: 30 });
    expect(parseSupersetType(null)).toEqual({ mode: 'round', betweenSec: 0 });
  });
});

describe('supersetStep', () => {
  it('stays on a unilateral exercise after R, then advances after L', () => {
    const a = ex('a', 'g', 3);
    a.sets = [{ pairId: 'p', completedAt: null }, { pairId: 'p', completedAt: new Date() }];
    const b = ex('b', 'g', 3);
    expect(supersetStep([a, b], 'a')?.nextEntryId).toBe('a');
    a.sets[0].completedAt = new Date();
    expect(supersetStep([a, b], 'a')?.nextEntryId).toBe('b');
  });
  it('is null outside a superset', () => {
    expect(supersetStep([ex('a', null, 2)], 'a')).toBeNull();
  });

  it('moves to the next exercise of the group without the full rest', () => {
    const list = [ex('a', 'g', 2), ex('b', 'g', 3), ex('c', null, 3)];
    expect(supersetStep(list, 'a')).toEqual({ nextEntryId: 'b', endOfRound: false, mode: 'round', betweenSec: 0 });
  });

  it('goes back to the first exercise with open sets at the end of the round', () => {
    const list = [ex('a', 'g', 2, 'superset:between:20'), ex('b', 'g', 2, 'superset:between:20')];
    expect(supersetStep(list, 'b')).toEqual({ nextEntryId: 'a', endOfRound: true, mode: 'between', betweenSec: 20 });
  });

  it('skips exercises already finished and ends when nothing is left', () => {
    expect(supersetStep([ex('a', 'g', 1), ex('b', 'g', 0), ex('c', 'g', 1)], 'a')?.nextEntryId).toBe('c');
    expect(supersetStep([ex('a', 'g', 0), ex('b', 'g', 0)], 'b')).toEqual({ nextEntryId: null, endOfRound: true, mode: 'round', betweenSec: 0 });
  });
});
