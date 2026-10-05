import { compareWithLast, type ComparableSet } from '../lastTime';

const set = (reps: number, extra: Partial<ComparableSet> = {}): ComparableSet => ({ reps, durationSec: null, distanceM: null, completedAt: new Date(), ...extra });
const options = { formNow: null, formLast: null, defaultRest: 90 };

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

  it('compares form ratings and uses seconds for holds', () => {
    const hold = (seconds: number) => ({ ...set(0), reps: null, durationSec: seconds });
    const result = compareWithLast([hold(20), hold(25)], [hold(20), hold(20)], 'time', { ...options, formNow: 4, formLast: 3 });
    expect(result.total).toEqual({ now: 45, last: 40 });
    expect(result.form).toEqual({ now: 4, last: 3 });
    expect(result.improved).toEqual({ total: true, rest: false, form: true });
  });

  it('has nothing to compare the first time', () => {
    const result = compareWithLast([set(8)], null, 'reps', { ...options, formNow: 4 });
    expect(result).toEqual({ total: null, rest: null, form: null, improved: { total: false, rest: false, form: false } });
  });

  it('keeps last time visible before anything is done today', () => {
    const result = compareWithLast([set(8, { completedAt: null })], [set(8, { restSec: 60 })], 'reps', { ...options, formLast: 3 });
    expect(result.total).toEqual({ now: 0, last: 8 });
    expect(result.rest).toEqual({ now: null, last: 60 });
    expect(result.form).toEqual({ now: null, last: 3 });
    expect(result.improved).toEqual({ total: false, rest: false, form: false });
  });
});
