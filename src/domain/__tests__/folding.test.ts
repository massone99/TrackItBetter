import { exerciseFinished, nextFolded } from '../folding';

const map = (entries: [string, boolean][]) => new Map(entries);

describe('nextFolded', () => {
  it('folds every exercise when the workout is first opened', () => {
    const folded = nextFolded(map([['a', false], ['b', false], ['c', true]]), map([]), map([]), true);
    expect([...folded]).toEqual([['a', true], ['b', true], ['c', true]]);
  });

  it('opens an exercise added later and keeps what was folded by hand', () => {
    const known = map([['a', false], ['b', false]]);
    const current = map([['a', true], ['b', false]]);
    const folded = nextFolded(map([['a', false], ['b', false], ['n', false]]), known, current, false);
    expect([...folded]).toEqual([['a', true], ['b', false], ['n', false]]);
  });

  it('folds an exercise when its last set is completed and unfolds it when a set reopens', () => {
    const current = map([['a', false], ['b', true]]);
    const folded = nextFolded(map([['a', true], ['b', false]]), map([['a', false], ['b', true]]), current, false);
    expect([...folded]).toEqual([['a', true], ['b', false]]);
  });
});

describe('exerciseFinished', () => {
  const set = (done: boolean, formRating: number | null, kind = 'working') => ({ kind, completedAt: done ? new Date() : null, formRating });
  it('waits for the form rating of every working set', () => {
    expect(exerciseFinished([set(true, 4), set(true, null)])).toBe(false);
    expect(exerciseFinished([set(true, 4), set(true, 3)])).toBe(true);
  });
  it('does not need a rating on warm-ups, and needs every set done', () => {
    expect(exerciseFinished([set(true, null, 'warmup'), set(true, 4)])).toBe(true);
    expect(exerciseFinished([set(true, 4), set(false, null)])).toBe(false);
    expect(exerciseFinished([])).toBe(false);
  });
});
