import type { ExerciseTree } from '../progressionGraph';
import { switchOptions, switchSignal, type SwitchSet, chainLadder } from '../switchOptions';

const set = (over: Partial<SwitchSet>): SwitchSet => ({ kind: 'working', completed: true, rpe: null, targetRpe: null, ...over });
const tree: ExerciseTree = {
  regressions: [{ id: 'easy', depth: 1, via: ['me'] }, { id: 'easier', depth: 2, via: ['easy'] }, { id: 'far', depth: 3, via: ['easier'] }],
  progressions: [{ id: 'hard', depth: 1, via: ['me'] }],
  prerequisites: ['need'],
  unlocks: [],
  variations: ['side', 'hard'],
};

describe('switch signal', () => {
  it('regresses after a working set at the limit or well over its target, progresses when the target is reached', () => {
    expect(switchSignal([set({ rpe: 9.5 })], false)).toBe('regress');
    expect(switchSignal([set({ rpe: 8, targetRpe: 6 })], true)).toBe('regress');
    expect(switchSignal([set({ rpe: 8, targetRpe: 7 })], true)).toBe('progress');
    expect(switchSignal([set({ rpe: 10, kind: 'warmup' })], false)).toBeNull();
    expect(switchSignal([set({ rpe: 10, completed: false })], false)).toBeNull();
    expect(switchSignal([set({ rpe: 10 }), set({ rpe: 7 })], false)).toBeNull();
    expect(switchSignal([], false)).toBeNull();
  });
});

describe('switch options', () => {
  it('lists the nearest easier, harder, variations and prerequisites, once each, within two steps', () => {
    expect(switchOptions(tree, null).map((option) => [option.id, option.relation])).toEqual([
      ['easy', 'easier'], ['easier', 'easier'], ['hard', 'harder'], ['side', 'variation'], ['need', 'prerequisite'],
    ]);
  });

  it('puts the suggested one first', () => {
    expect(switchOptions(tree, 'regress')[0]).toEqual({ id: 'easy', relation: 'easier', depth: 1, suggested: true });
    expect(switchOptions(tree, 'progress').map((option) => option.id)).toEqual(['hard', 'easy', 'easier', 'side', 'need']);
    expect(switchOptions({ ...tree, regressions: [] }, 'regress').some((option) => option.suggested)).toBe(false);
  });
});

describe('chainLadder', () => {
  const steps = ['lean', 'frog', 'tuck', 'adv', 'straddle'];

  it('lists every step in order, not only the neighbours', () => {
    expect(chainLadder(steps, 'tuck', new Set(), null).map((step) => [step.id, step.position])).toEqual([['lean', 1], ['frog', 2], ['tuck', 3], ['adv', 4], ['straddle', 5]]);
  });

  it('marks current, reached and suggested steps, the current one first', () => {
    const ladder = chainLadder(steps, 'tuck', new Set(['lean', 'frog', 'tuck']), 'adv');
    expect(ladder.map((step) => step.state)).toEqual(['reached', 'reached', 'current', 'suggested', 'open']);
  });
});
