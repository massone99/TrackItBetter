import { buildNarrationPlan, type NarrationExercise, type NarrationSet } from '../narration';

const set = (id: string, overrides: Partial<NarrationSet> = {}): NarrationSet => ({ id, durationSec: 30, reps: null, restSec: 20, done: false, ...overrides });
const exercise = (entryId: string, sets: NarrationSet[], overrides: Partial<NarrationExercise> = {}): NarrationExercise => ({ entryId, groupId: null, groupType: null, sets, ...overrides });
const kinds = (plan: ReturnType<typeof buildNarrationPlan>) => plan.map((s) => s.kind === 'work' ? `work${s.stepIndex}:${s.round}${s.side ? s.side[0] : ''}` : `${s.kind}${s.stepIndex}:${s.durationSec}`);

describe('buildNarrationPlan', () => {
  it('puts a preparation before every set and keeps the rest separate', () => {
    const plan = buildNarrationPlan([exercise('a', [set('1'), set('2')]), exercise('b', [set('3')])], 5);
    expect(kinds(plan)).toEqual(['prep0:5', 'work0:1', 'rest0:20', 'prep0:5', 'work0:2', 'rest1:20', 'prep1:5', 'work1:1']);
  });

  it('goes round by round in a superset, resting only after the round', () => {
    const group = { groupId: 'g', groupType: 'superset' };
    const plan = buildNarrationPlan([exercise('a', [set('1'), set('2')], group), exercise('b', [set('3'), set('4')], group)], 3);
    expect(kinds(plan)).toEqual([
      'prep0:3', 'work0:1', 'prep1:3', 'work1:1', 'rest0:20', 'prep0:3', 'work0:2', 'prep1:3', 'work1:2',
    ]);
  });

  it('rests between the exercises of a superset when asked', () => {
    const group = { groupId: 'g', groupType: 'superset:between:10' };
    const plan = buildNarrationPlan([exercise('a', [set('1')], group), exercise('b', [set('2')], group)], 0);
    expect(kinds(plan)).toEqual(['work0:1', 'rest1:10', 'work1:1']);
  });

  it('does both sides of a unilateral pair with a switch at least as long as the preparation', () => {
    const left = set('1', { pairId: 'p', side: 'left' });
    const right = set('2', { pairId: 'p', side: 'right' });
    expect(kinds(buildNarrationPlan([exercise('a', [right, left])], 8))).toEqual(['prep0:8', 'work0:1l', 'switch0:8', 'work0:1r']);
    const side = buildNarrationPlan([exercise('a', [left, right], { unilateralRestMode: 'side' })], 2);
    expect(kinds(side)).toEqual(['prep0:2', 'work0:1l', 'rest0:20', 'switch0:5', 'work0:1r']);
  });

  it('skips completed sets and uses reps when a set has no duration', () => {
    const plan = buildNarrationPlan([exercise('a', [set('1', { done: true }), set('2', { durationSec: null, reps: 8 })])], 0);
    expect(plan).toEqual([{ kind: 'work', stepIndex: 0, round: 2, side: null, mode: 'reps', durationSec: null, reps: 8, setIds: ['2'] }]);
  });
});

describe('buildNarrationPlan with a half-done pair', () => {
  it('narrates only the side still open', () => {
    const left = set('1', { pairId: 'p', side: 'left', done: true });
    const right = set('2', { pairId: 'p', side: 'right' });
    expect(kinds(buildNarrationPlan([exercise('a', [left, right])], 0))).toEqual(['work0:1r']);
  });
});
