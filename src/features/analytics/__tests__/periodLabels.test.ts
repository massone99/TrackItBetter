import { formatPeriod, formatPeriodShort } from '../periodLabels';

const period = (start: Date, end: Date, workoutName: string | null = null) => ({ id: 'x', start, end, workoutName });

describe('period labels', () => {
  it('writes a week inside one month compactly and across months in full', () => {
    expect(formatPeriod(period(new Date(2026, 8, 21), new Date(2026, 8, 27)), 'week', 'en')).toBe('21–27 Sep');
    expect(formatPeriod(period(new Date(2026, 8, 28), new Date(2026, 9, 4)), 'week', 'en')).toBe('28 Sep – 4 Oct');
    expect(formatPeriod(period(new Date(2026, 8, 21), new Date(2026, 8, 27)), 'week', 'it')).toBe('21–27 set');
  });

  it('capitalises months and names sessions', () => {
    expect(formatPeriod(period(new Date(2026, 8, 1), new Date(2026, 8, 30)), 'month', 'it')).toBe('Settembre 2026');
    expect(formatPeriod(period(new Date(2026, 8, 28, 7, 5), new Date(2026, 8, 28, 7, 5), 'Grease the Groove'), 'session', 'en')).toMatch(/^Grease the Groove · 28 Sep/);
  });

  it('keeps chart labels short', () => {
    expect(formatPeriodShort(new Date(2026, 8, 28), 'day', 'en')).toBe('28 Sep');
    expect(formatPeriodShort(new Date(2026, 8, 1), 'month', 'it')).toBe('set');
  });
});
