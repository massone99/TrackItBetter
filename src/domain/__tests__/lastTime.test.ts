import { compareWithLast, type ComparableSet } from '../lastTime';

const set = (reps: number, extra: Partial<ComparableSet> = {}): ComparableSet => ({ reps, durationSec: null, distanceM: null, completedAt: new Date(), ...extra });
const options = { defaultRest: 90 };

describe('compareWithLast', () => {
  it('sums reps of completed working sets and flags a higher total', () => {
    const result = compareWithLast([set(8), set(8), set(9), set(5, { kind: 'warmup' }), set(8, { completedAt: null })], [set(8), set(7), set(7)], 'reps', options);
    expect(result.total).toEqual({ now: 25, last: 22 });
    expect(result.improved.total).toBe(true);
  });

  it('counts an L/R pair once, as the mean of its sides', () => {
    const pair = (left: number, right: number, id: string) => [set(left, { pairId: id, side: 'left' }), set(right, { pairId: id, side: 'right' })];
    const result = compareWithLast([...pair(6, 8, 'a')], [...pair(6, 6, 'b')], 'reps', options);
    expect(result.total).toEqual({ now: 7, last: 6 });
  });

  it('compares the average rest set on the sets, using the default when a set has none', () => {
    const result = compareWithLast([set(8, { restSec: 60 }), set(8)], [set(8, { restSec: 120 }), set(8, { restSec: 120 })], 'reps', options);
    expect(result.rest).toEqual({ now: 75, last: 120 });
    expect(result.improved.rest).toBe(true);
  });

  it('compares the average form of the sets and uses seconds for holds', () => {
    const hold = (seconds: number, formRating: number) => ({ ...set(0), reps: null, durationSec: seconds, formRating });
    const result = compareWithLast([hold(20, 4), hold(25, 5)], [hold(20, 3), hold(20, 4)], 'time', options);
    expect(result.total).toEqual({ now: 45, last: 40 });
    expect(result.form).toEqual({ now: 4.5, last: 3.5 });
    expect(result.improved).toEqual({ total: true, rest: false, form: true, rpe: false });
    expect(result.worse.form).toBe(false);
  });

  it('flags a lower average form', () => {
    const result = compareWithLast([set(8, { formRating: 3 }), set(8, { formRating: 3 })], [set(8, { formRating: 4 })], 'reps', options);
    expect(result.form).toEqual({ now: 3, last: 4 });
    expect(result.worse.form).toBe(true);
  });

  it('calls the same work at a lower average RPE a mini PR', () => {
    const at = (reps: number, kg: number, rpe: number | null, extra: Partial<ComparableSet> = {}) => set(reps, { addedLoadKg: kg, rpe, ...extra });
    const last = [at(8, 10, 9), at(8, 10, 9)];
    const easier = compareWithLast([at(8, 10, 8), at(8, 10, 8.5)], last, 'reps', options);
    expect(easier.rpe).toEqual({ now: 8.3, last: 9 });
    expect(easier.improved.rpe).toBe(true);
    // Fewer reps, another load, a set still open or a set without RPE: not the same work, or no average.
    expect(compareWithLast([at(8, 10, 8), at(7, 10, 8)], last, 'reps', options).improved.rpe).toBe(false);
    expect(compareWithLast([at(8, 5, 8), at(8, 10, 8)], last, 'reps', options).improved.rpe).toBe(false);
    expect(compareWithLast([at(8, 10, 8), at(8, 10, 8, { completedAt: null })], last, 'reps', options).improved.rpe).toBe(false);
    expect(compareWithLast([at(8, 10, 8), at(8, 10, null)], last, 'reps', options).rpe).toEqual({ now: null, last: 9 });
    // Last time without an RPE on every set has no average to beat.
    expect(compareWithLast([at(8, 10, 8), at(8, 10, 8)], [at(8, 10, 9), at(8, 10, null)], 'reps', options).rpe).toBeNull();
    // Longer rest or worse form spoil it.
    expect(compareWithLast([at(8, 10, 8, { restSec: 180 }), at(8, 10, 8, { restSec: 180 })], last, 'reps', options).improved.rpe).toBe(false);
  });

  it('has nothing to compare the first time', () => {
    const result = compareWithLast([set(8, { formRating: 4 })], null, 'reps', options);
    expect(result).toEqual({ total: null, rest: null, form: null, rpe: null, improved: { total: false, rest: false, form: false, rpe: false }, worse: { form: false } });
  });

  it('keeps last time visible before anything is done today', () => {
    const result = compareWithLast([set(8, { completedAt: null })], [set(8, { restSec: 60, formRating: 3 })], 'reps', options);
    expect(result.total).toEqual({ now: 0, last: 8 });
    expect(result.rest).toEqual({ now: null, last: 60 });
    expect(result.form).toEqual({ now: null, last: 3 });
    expect(result.improved).toEqual({ total: false, rest: false, form: false, rpe: false });
  });
});
