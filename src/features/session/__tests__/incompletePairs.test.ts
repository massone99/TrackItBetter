import { incompletePairs } from '../incompletePairs';
import type { SessionExercise, SessionSet } from '../repository';

const set = (index: number, side: string, pairId: string | null, done: boolean) => ({ id: `s${index}${side}`, index, side, pairId, completedAt: done ? new Date() : null }) as unknown as SessionSet;
const exercise = (name: string, sets: SessionSet[]) => ({ entryId: name, exerciseId: name, name, sets }) as unknown as SessionExercise;

describe('incompletePairs', () => {
  it('lists the pairs with one side done and names the side still to do', () => {
    const result = incompletePairs([
      exercise('Pistol', [set(1, 'left', 'a', true), set(1, 'right', 'a', true), set(2, 'left', 'b', true), set(2, 'right', 'b', false)]),
      exercise('Dip', [set(1, 'both', null, false)]),
    ]);
    expect(result).toEqual([{ entryId: 'Pistol', name: 'Pistol', setNumber: 2, missing: ['right'], done: { left: true, right: false } }]);
  });

  it('does not list pairs that are untouched or complete, nor sets without sides', () => {
    expect(incompletePairs([exercise('Pistol', [set(1, 'left', 'a', false), set(1, 'right', 'a', false), set(2, 'left', 'b', true), set(2, 'right', 'b', true)])])).toEqual([]);
  });
});
