import { averageRpe, formatRpe, isValidRpe, rpeToRir } from '../rpe';

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
