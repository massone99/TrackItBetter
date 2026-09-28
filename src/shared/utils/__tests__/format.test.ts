import { formatClock, formatMinutes, parseNumberInput } from '../format';

describe('parseNumberInput', () => {
  it('reads plain and decimal-comma numbers', () => {
    expect(parseNumberInput(' 12 ')).toBe(12);
    expect(parseNumberInput('2,5')).toBe(2.5);
    expect(parseNumberInput('-5')).toBe(-5);
  });

  it('reads m:ss only when asked', () => {
    expect(parseNumberInput('1:30', true)).toBe(90);
    expect(parseNumberInput('0:07', true)).toBe(7);
    expect(parseNumberInput('1:75', true)).toBeNull();
    expect(parseNumberInput('1:30')).toBeNull();
  });

  it('rejects empty and non-numeric input', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
  });

  it('round-trips with the clock format', () => {
    expect(parseNumberInput(formatClock(125), true)).toBe(125);
  });
});

describe('formatMinutes', () => {
  it('rounds to whole minutes and switches to hours past 60', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(89)).toBe('1 min');
    expect(formatMinutes(725)).toBe('12 min');
    expect(formatMinutes(3900)).toBe('1 h 05 min');
  });
});
