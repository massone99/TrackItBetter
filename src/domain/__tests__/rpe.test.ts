import { averageRpe, estimateMaxHold, estimateMaxReps, formatRpe, isValidRpe, rpeToRir } from '../rpe';

describe('rpe', () => {
  it('accepts half steps from 6 to 10 only', () => {
    expect(isValidRpe(8.5)).toBe(true);
    expect(isValidRpe(10)).toBe(true);
    expect(isValidRpe(8.3)).toBe(false);
    expect(isValidRpe(5)).toBe(false);
    expect(isValidRpe('8')).toBe(false);
  });

  it('converts to reps in reserve', () => {
    expect(rpeToRir(10)).toBe(0);
    expect(rpeToRir(7.5)).toBe(2.5);
    expect(() => rpeToRir(11)).toThrow(RangeError);
  });

  it('estimates max reps from reps in reserve', () => {
    expect(estimateMaxReps(10, 8)).toBe(12);
    expect(estimateMaxReps(5, 10)).toBe(5);
    expect(estimateMaxReps(6, 7.5)).toBe(8.5);
    expect(estimateMaxReps(10, null)).toBeNull();
    expect(estimateMaxReps(10, 5)).toBeNull();
    expect(estimateMaxReps(0, 8)).toBeNull();
  });

  it('estimates max hold as a share of the maximum', () => {
    expect(estimateMaxHold(40, 8)).toBe(50);
    expect(estimateMaxHold(30, 10)).toBe(30);
    expect(estimateMaxHold(30, undefined)).toBeNull();
    expect(estimateMaxHold(null, 8)).toBeNull();
  });

  it('averages only rated sets', () => {
    expect(averageRpe([8, null, 9, undefined])).toBe(8.5);
    expect(averageRpe([7, 8, 8])).toBe(7.7);
    expect(averageRpe([null])).toBeNull();
  });

  it('formats whole and half values', () => {
    expect(formatRpe(8)).toBe('8');
    expect(formatRpe(8.5)).toBe('8.5');
  });
});
