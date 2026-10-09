import { estimateStrength, netLoadKg, oneRepMaxEstimate } from '../strengthEstimates';

const base = { mode: 'reps' as const, amount: 5, rpe: 8, addedLoadKg: 0, assistKg: 0, bodyweightKg: 70, bodyShare: 1 };

describe('netLoadKg', () => {
  it('subtracts the help, and is unknown when bands helped without kg', () => {
    expect(netLoadKg(10, 4, 1)).toBe(6);
    expect(netLoadKg(0, 20, 2)).toBe(-20);
    expect(netLoadKg(5, null, 1)).toBeNull();
    expect(netLoadKg(5, null, 0)).toBe(5);
  });
});

describe('oneRepMaxEstimate', () => {
  it('counts the reps in reserve, and stops past 12 reps', () => {
    expect(oneRepMaxEstimate(80, 5, 8)).toBeCloseTo(80 * (1 + 7 / 30), 5);
    expect(oneRepMaxEstimate(80, 5, null)).toBeCloseTo(80 * (1 + 5 / 30), 5);
    expect(oneRepMaxEstimate(80, 11, 8)).toBeNull();
    expect(oneRepMaxEstimate(0, 5, 8)).toBeNull();
  });
});

describe('estimateStrength', () => {
  it('estimates max reps, 1RM and the load for rep counts of a bodyweight set with added load', () => {
    const result = estimateStrength({ ...base, addedLoadKg: 10 });
    expect(result.effectiveLoadKg).toBe(80);
    expect(result.maxReps).toBe(7);
    expect(result.oneRepMaxKg).toBeCloseTo(98.67, 1);
    expect(result.vsBodyKg).toBeCloseTo(28.7, 1);
    expect(result.table.map((row) => row.reps)).toEqual([1, 3, 5, 8, 10, 12]);
    expect(result.table[0].loadKg).toBeCloseTo(98.7, 1);
    // 5 reps: 98.67 / (1 + 5/30) = 84.6 kg, i.e. 14.6 kg on top of the body.
    expect(result.table[2]).toMatchObject({ reps: 5 });
    expect(result.table[2].loadKg).toBeCloseTo(84.6, 1);
    expect(result.table[2].vsBodyKg).toBeCloseTo(14.6, 1);
  });

  it('works with help from bands: the 1RM can still be below the body', () => {
    const result = estimateStrength({ ...base, assistKg: 30, rpe: 10 });
    expect(result.netLoadKg).toBe(-30);
    expect(result.effectiveLoadKg).toBe(40);
    expect(result.oneRepMaxKg).toBeCloseTo(46.67, 1);
    expect(result.vsBodyKg).toBeCloseTo(-23.3, 1);
  });

  it('has no 1RM when the load moved is not positive, or without a body share the barbell load alone counts', () => {
    expect(estimateStrength({ ...base, assistKg: 80 }).oneRepMaxKg).toBeNull();
    const barbell = estimateStrength({ ...base, bodyShare: 0, addedLoadKg: 60, bodyweightKg: null });
    expect(barbell.effectiveLoadKg).toBe(60);
    expect(barbell.vsBodyKg).toBeNull();
    expect(barbell.table[3].vsBodyKg).toBeNull();
  });

  it('reads a hold from the RPE, or as it is without one', () => {
    expect(estimateStrength({ ...base, mode: 'hold', amount: 20, rpe: 8 })).toMatchObject({ maxHoldSec: 25, maxReps: null, oneRepMaxKg: null });
    expect(estimateStrength({ ...base, mode: 'hold', amount: 20, rpe: null }).maxHoldSec).toBe(20);
  });
});
