import { bandRanks, compareBandHelp, orderAfterSetEdit, parseHexColor, type SetBand } from '../equipment';
import { compareWithLast, type ComparableSet } from '../lastTime';

const set = (reps: number, extra: Partial<ComparableSet> = {}): ComparableSet => ({ reps, durationSec: null, distanceM: null, completedAt: new Date(), ...extra });
const options = { defaultRest: 90 };

describe('compareWithLast', () => {
  it('compares band assistance in kg: less help is progress, unknown kg hide the comparison', () => {
    const set = (assistKg: number | null, done = true) => ({ reps: 5, durationSec: null, distanceM: null, bands: [{ bandId: 'blue', tension: 2 as const }], assistKg, completedAt: done ? new Date() : null, kind: 'working' });
    const better = compareWithLast([set(15), set(15)], [set(25), set(25)], 'reps', { defaultRest: 90 });
    expect(better.assist).toEqual({ now: 15, last: 25 });
    expect(better.improved.assist).toBe(true);
    const unknown = compareWithLast([set(null)], [set(25)], 'reps', { defaultRest: 90 });
    expect(unknown.assist).toBeNull();
    expect(unknown.assistUnknown).toBe(true);
  });

  it('without kg, compares bands through the strength order, also across band sets', () => {
    const ranks = new Map([['green-other-brand', 0], ['blue', 1], ['red', 2]]);
    const compareBands = (a: readonly SetBand[], b: readonly SetBand[]) => compareBandHelp(a, b, ranks);
    const set = (bandId: string, tension: 1 | 2 | 3) => ({ reps: 5, durationSec: null, distanceM: null, bands: [{ bandId, tension }], assistKg: null, completedAt: new Date(), kind: 'working' });
    const lighter = compareWithLast([set('green-other-brand', 3)], [set('blue', 1)], 'reps', { defaultRest: 90, compareBands });
    expect(lighter.assistOrder).toBe('less');
    expect(lighter.improved.assist).toBe(true);
    expect(lighter.assistUnknown).toBe(false);
    expect(compareWithLast([set('blue', 2)], [set('blue', 2)], 'reps', { defaultRest: 90, compareBands }).assistOrder).toBe('same');
    expect(compareWithLast([set('red', 1)], [set('blue', 3)], 'reps', { defaultRest: 90, compareBands }).assistOrder).toBe('more');
    // One strong band against two lighter ones: the order cannot tell.
    const two = { ...set('blue', 2), bands: [{ bandId: 'blue', tension: 2 as const }, { bandId: 'green-other-brand', tension: 2 as const }] };
    expect(compareBandHelp(set('red', 2).bands, two.bands, ranks)).toBeNull();
    expect(compareBandHelp(set('blue', 2).bands, two.bands, ranks)).toBe(-1);
  });

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
    expect(result.improved).toEqual({ total: true, rest: false, form: true, rpe: false, assist: false });
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
    expect(result).toEqual({ total: null, rest: null, form: null, rpe: null, assist: null, assistUnknown: false, assistOrder: null, improved: { total: false, rest: false, form: false, rpe: false, assist: false }, worse: { form: false } });
  });

  it('keeps last time visible before anything is done today', () => {
    const result = compareWithLast([set(8, { completedAt: null })], [set(8, { restSec: 60, formRating: 3 })], 'reps', options);
    expect(result.total).toEqual({ now: 0, last: 8 });
    expect(result.rest).toEqual({ now: null, last: 60 });
    expect(result.form).toEqual({ now: null, last: 3 });
    expect(result.improved).toEqual({ total: false, rest: false, form: false, rpe: false, assist: false });
  });
});

describe('band strength order', () => {
  it('keeps one order across band sets and lets a set reorder its own bands in place', () => {
    const sets = [
      { id: 'a', name: 'A', bands: [{ id: 'a1', name: '', color: '', minKg: null, maxKg: null }, { id: 'a2', name: '', color: '', minKg: null, maxKg: null }] },
      { id: 'b', name: 'B', bands: [{ id: 'b1', name: '', color: '', minKg: null, maxKg: null }] },
    ];
    expect([...bandRanks(sets, ['b1', 'a1']).keys()]).toEqual(['b1', 'a1', 'a2']);
    const edited = { ...sets[0], bands: [sets[0].bands[1], sets[0].bands[0], { id: 'a3', name: '', color: '', minKg: null, maxKg: null }] };
    expect(orderAfterSetEdit(['a1', 'b1', 'a2'], sets, edited)).toEqual(['a2', 'b1', 'a1', 'a3']);
  });
});

describe('parseHexColor', () => {
  it('reads 3 or 6 hex digits, with or without #', () => {
    expect(parseHexColor('2f80ed')).toBe('#2F80ED');
    expect(parseHexColor(' #abc ')).toBe('#AABBCC');
    expect(parseHexColor('#12')).toBeNull();
    expect(parseHexColor('blue')).toBeNull();
  });
});
