import { chainEdges, exerciseTree, findCycle, graphLevels, linkProblem, type GraphEdge } from '../progressionGraph';

const p = (from: string, to: string): GraphEdge => ({ from, to, kind: 'progression' });

describe('progression graph', () => {
  it('turns chain steps into edges in step order', () => {
    expect(chainEdges([
      { chainId: 'c', exerciseId: 'b', position: 2 },
      { chainId: 'c', exerciseId: 'a', position: 1 },
      { chainId: 'c', exerciseId: 'x', position: 3 },
      { chainId: 'd', exerciseId: 'a', position: 1 },
    ])).toEqual([p('a', 'b'), p('b', 'x')]);
  });

  it('finds loops through progressions and prerequisites, not variations', () => {
    expect(findCycle([p('a', 'b'), p('b', 'c')])).toBeNull();
    expect(findCycle([p('a', 'b'), { from: 'b', to: 'a', kind: 'variation' }])).toBeNull();
    expect(findCycle([p('a', 'b'), p('b', 'c'), { from: 'c', to: 'a', kind: 'prerequisite' }])).toEqual(['a', 'b', 'c', 'a']);
  });

  it('refuses a relation to itself, a duplicate (variations both ways) and a loop', () => {
    const edges = [p('a', 'b'), p('b', 'c'), { from: 'a', to: 'v', kind: 'variation' as const }];
    expect(linkProblem(edges, p('a', 'a'))).toEqual({ kind: 'self' });
    expect(linkProblem(edges, p('a', 'b'))).toEqual({ kind: 'duplicate' });
    expect(linkProblem(edges, { from: 'v', to: 'a', kind: 'variation' })).toEqual({ kind: 'duplicate' });
    expect(linkProblem(edges, p('c', 'a'))).toEqual({ kind: 'cycle', path: ['a', 'b', 'c', 'a'] });
    expect(linkProblem(edges, p('a', 'c'))).toBeNull();
  });

  it('builds the tree around an exercise, with nodes under several parents', () => {
    // tuck → adv tuck → straddle → full, and tuck → one leg → full (two ways up).
    const edges = [p('tuck', 'adv'), p('adv', 'straddle'), p('straddle', 'full'), p('adv', 'one-leg'), p('one-leg', 'full'),
      { from: 'lean', to: 'tuck', kind: 'prerequisite' as const }, { from: 'tuck', to: 'pseudo', kind: 'variation' as const }];
    const tree = exerciseTree(edges, 'adv');
    expect(tree.regressions).toEqual([{ id: 'tuck', depth: 1, via: ['adv'] }]);
    expect(tree.progressions).toEqual([
      { id: 'straddle', depth: 1, via: ['adv'] },
      { id: 'one-leg', depth: 1, via: ['adv'] },
      { id: 'full', depth: 2, via: ['straddle', 'one-leg'] },
    ]);
    const tuck = exerciseTree(edges, 'tuck');
    expect(tuck.prerequisites).toEqual(['lean']);
    expect(tuck.variations).toEqual(['pseudo']);
    expect(exerciseTree(edges, 'lean').unlocks).toEqual(['tuck']);
  });

  it('gives each exercise the level of its longest way in, none inside a loop', () => {
    const levels = graphLevels([p('a', 'b'), p('b', 'd'), p('a', 'c'), p('c', 'e'), p('e', 'd')]);
    expect(Object.fromEntries(levels)).toEqual({ a: 1, b: 2, c: 2, e: 3, d: 4 });
    expect(graphLevels([p('x', 'y'), p('y', 'x')]).size).toBe(0);
  });
});
