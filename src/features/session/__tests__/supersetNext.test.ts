import { supersetStep } from '../superset';

const exercise = (entryId: string, done: boolean[]) => ({
  entryId, groupId: 'g', groupType: 'superset', sets: done.map((isDone) => ({ completedAt: isDone ? new Date() : null, pairId: null })),
});

describe('superset: the next set to do', () => {
  it('goes to the other exercise, then back to the first one once the round is over', () => {
    expect(supersetStep([exercise('A', [true, false]), exercise('B', [false, false])], 'A')?.nextEntryId).toBe('B');
    expect(supersetStep([exercise('A', [true, false]), exercise('B', [true, false])], 'B')?.nextEntryId).toBe('A');
  });

  it('stays on the exercise when the other one has nothing left', () => {
    expect(supersetStep([exercise('A', [true, false]), exercise('B', [true, true])], 'A')?.nextEntryId).toBe('A');
  });
});
