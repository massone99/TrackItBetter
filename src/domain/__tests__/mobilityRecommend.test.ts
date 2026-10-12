import { daysSinceRun, recommendRoutine } from '../mobilityRecommend';

const now = new Date('2026-10-12T12:00:00Z');
const routine = (id: string, extra: { favourite?: boolean; lastDoneAt?: string; updatedAt?: string } = {}) => ({ id, favourite: false, updatedAt: '2026-10-01T00:00:00Z', ...extra });

describe('recommendRoutine', () => {
  it('prefers a routine never run, then the one run longest ago', () => {
    expect(recommendRoutine([routine('a', { lastDoneAt: '2026-10-10T08:00:00Z' }), routine('b')], now)?.id).toBe('b');
    expect(recommendRoutine([routine('a', { lastDoneAt: '2026-10-10T08:00:00Z' }), routine('b', { lastDoneAt: '2026-10-05T08:00:00Z' })], now)?.id).toBe('b');
  });

  it('breaks ties with favourites, then the most recently edited', () => {
    expect(recommendRoutine([routine('a'), routine('b', { favourite: true })], now)?.id).toBe('b');
    expect(recommendRoutine([routine('a', { updatedAt: '2026-10-02T00:00:00Z' }), routine('b')], now)?.id).toBe('a');
  });

  it('skips routines run in the last 12 hours and returns null when none is left', () => {
    expect(recommendRoutine([routine('a', { lastDoneAt: '2026-10-12T06:00:00Z' }), routine('b', { lastDoneAt: '2026-10-11T00:00:00Z' })], now)?.id).toBe('b');
    expect(recommendRoutine([routine('a', { lastDoneAt: '2026-10-12T06:00:00Z' })], now)).toBeNull();
    expect(recommendRoutine([], now)).toBeNull();
  });
});

describe('daysSinceRun', () => {
  it('counts whole days, null when never run', () => {
    expect(daysSinceRun({ lastDoneAt: '2026-10-09T10:00:00Z' }, now)).toBe(3);
    expect(daysSinceRun({}, now)).toBeNull();
  });
});
