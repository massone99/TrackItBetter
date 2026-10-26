import { filterSessions, groupByMonth, monthGrid, NO_FILTERS, shortcutsFor, type PickableSession } from '../comparePicker';

const session = (id: string, name: string, date: string, reps: number[], load = 0, rpe: number | null = null, notes: string | null = null): PickableSession => ({
  workoutId: id, workoutName: name, startedAt: new Date(date), notes,
  sets: reps.map((value) => ({ kind: 'working', reps: value, durationSec: null, distanceM: null, addedLoadKg: load, rpe, completedAt: new Date(date) })),
});

const all = [
  session('a', 'Push', '2026-10-19T10:00:00', [8, 8, 8], 0, 9),
  session('b', 'Pull', '2026-10-12T10:00:00', [10, 10], 10, 7, 'ottimo'),
  session('c', 'Push', '2026-09-28T10:00:00', [12, 12, 12, 12], 5, 8),
];

describe('filterSessions', () => {
  const now = new Date('2026-10-26T12:00:00');
  it('sorts newest first and by volume', () => {
    expect(filterSessions(all, NO_FILTERS, 'recent', 'reps', 'en', now).map((s) => s.workoutId)).toEqual(['a', 'b', 'c']);
    expect(filterSessions(all, NO_FILTERS, 'volume', 'reps', 'en', now).map((s) => s.workoutId)).toEqual(['c', 'a', 'b']);
  });
  it('filters by period, name, effort, note and text', () => {
    expect(filterSessions(all, { ...NO_FILTERS, period: '30d' }, 'recent', 'reps', 'en', now).map((s) => s.workoutId)).toEqual(['a', 'b', 'c']);
    expect(filterSessions(all, { ...NO_FILTERS, period: '30d' }, 'recent', 'reps', 'en', new Date('2026-11-20T12:00:00')).map((s) => s.workoutId)).toEqual([]);
    expect(filterSessions(all, { ...NO_FILTERS, name: 'Push' }, 'recent', 'reps', 'en', now)).toHaveLength(2);
    expect(filterSessions(all, { ...NO_FILTERS, hardOnly: true }, 'recent', 'reps', 'en', now).map((s) => s.workoutId)).toEqual(['a', 'c']);
    expect(filterSessions(all, { ...NO_FILTERS, withNote: true }, 'recent', 'reps', 'en', now).map((s) => s.workoutId)).toEqual(['b']);
    expect(filterSessions(all, { ...NO_FILTERS, query: 'OTTIMO' }, 'recent', 'reps', 'en', now).map((s) => s.workoutId)).toEqual(['b']);
  });
});

describe('shortcutsFor', () => {
  it('offers last, same workout, best and first', () => {
    const ids = shortcutsFor(all, 'reps', 'Pull').map((s) => `${s.id}:${s.session.workoutId}`);
    expect(ids).toEqual(['last:a', 'sameWorkout:b', 'bestVolume:c', 'bestSet:c', 'heaviest:b', 'first:c']);
  });
  it('is empty without history and skips the same workout when there is none', () => {
    expect(shortcutsFor([], 'reps', 'Push')).toEqual([]);
    expect(shortcutsFor(all, 'reps', 'Legs').some((s) => s.id === 'sameWorkout')).toBe(false);
  });
});

describe('calendar and months', () => {
  it('groups by month in order', () => {
    expect(groupByMonth(all, 'en').map((g) => [g.key, g.items.length])).toEqual([['2026-10', 2], ['2026-09', 1]]);
  });
  it('lays a month out from Monday with the days that have sessions', () => {
    const cells = monthGrid(2026, 9, all);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]?.day).toBe(1);
    expect(cells.filter((cell) => cell && cell.sessions.length).map((cell) => cell!.day)).toEqual([12, 19]);
  });
});
