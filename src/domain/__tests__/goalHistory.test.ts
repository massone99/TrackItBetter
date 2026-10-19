import type { DailyGoal, DaySet } from '../dailyGoals';
import { periodResults, periodStarts, streaks } from '../goalHistory';

const goal: DailyGoal = { id: 'g', scope: 'category', key: 'push', measure: 'reps', target: 10 };
const set = (day: number, reps: number): DaySet => ({
  workoutId: `w${day}`, workoutName: 'W', exerciseId: 'e', exerciseName: 'E', completedAt: new Date(2026, 9, day, 9),
  reps, durationSec: null, categories: ['push'], group: null, tags: [],
});
const now = new Date(2026, 9, 14, 20); // Wednesday

describe('goal history', () => {
  it('builds consecutive day starts ending today', () => {
    const days = periodStarts(now, 3, 'day');
    expect(days.map((d) => d.getDate())).toEqual([12, 13, 14]);
    expect(periodStarts(now, 2, 'week').map((d) => d.getDate())).toEqual([5, 12]);
  });

  it('marks days all / partial / empty and counts reached goals', () => {
    const two: DailyGoal[] = [goal, { ...goal, id: 'h', key: 'pull' }];
    const sets = [set(12, 10), { ...set(13, 4) }, { ...set(14, 10), categories: ['push', 'pull'] }];
    const out = periodResults(two, sets, periodStarts(now, 4, 'day'), 'day', now);
    expect(out.map((r) => r.status)).toEqual(['empty', 'partial', 'partial', 'all']);
    expect(out[3].reached).toBe(2);
    expect(out[3].current).toBe(true);
  });

  it('groups sets by week, Monday to Sunday', () => {
    const out = periodResults([{ ...goal, target: 15 }], [set(6, 8), set(11, 8), set(12, 5)], periodStarts(now, 2, 'week'), 'week', now);
    expect(out.map((r) => r.status)).toEqual(['all', 'partial']);
  });

  it('counts streaks; an unfinished today does not break the run', () => {
    const sets = [set(10, 10), set(11, 10), set(12, 10), set(13, 3)];
    const out = periodResults([goal], sets, periodStarts(now, 5, 'day'), 'day', now);
    expect(streaks(out)).toEqual({ current: 0, best: 3 });
    const withToday = periodResults([goal], [set(12, 10), set(13, 10)], periodStarts(now, 3, 'day'), 'day', now);
    expect(streaks(withToday)).toEqual({ current: 2, best: 2 });
  });
});
