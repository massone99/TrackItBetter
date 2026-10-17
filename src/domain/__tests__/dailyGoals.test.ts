import { dailyGoalProgress, goalMatches, parseDailyGoals, startOfWeek, targetMax, type DailyGoal, type DaySet } from '../dailyGoals';

const set = (over: Partial<DaySet>): DaySet => ({
  workoutId: 'w1', workoutName: 'Mini 1', exerciseId: 'e1', exerciseName: 'Couch stretch', completedAt: new Date(2026, 9, 15, 8),
  reps: null, durationSec: null, categories: ['mobility'], group: null, tags: ['Hip flexion'], ...over,
});
const goal = (over: Partial<DailyGoal>): DailyGoal => ({ id: 'g', scope: 'tag', key: 'Hip flexion', measure: 'minutes', target: 60, ...over });

describe('daily goals', () => {
  it('matches by category (extras included), group and tag', () => {
    const item = set({ categories: ['skill', 'push'], group: 'vertical-push', tags: ['Shoulder flexion'] });
    expect(goalMatches({ scope: 'category', key: 'push' }, item)).toBe(true);
    expect(goalMatches({ scope: 'group', key: 'vertical-push' }, item)).toBe(true);
    expect(goalMatches({ scope: 'group', key: 'horizontal-push' }, item)).toBe(false);
    expect(goalMatches({ scope: 'tag', key: 'Hip flexion' }, item)).toBe(false);
  });

  it('sums seconds of timed sets across workouts and groups contributions', () => {
    const progress = dailyGoalProgress(goal({}), [
      set({ durationSec: 20 }),
      set({ durationSec: 15, completedAt: new Date(2026, 9, 15, 8, 5) }),
      set({ workoutId: 'w2', workoutName: 'Mini 2', durationSec: 10, completedAt: new Date(2026, 9, 15, 12) }),
      set({ reps: 10 }),
      set({ durationSec: 40, tags: ['Hip extension'] }),
    ]);
    expect(progress.done).toBe(45);
    expect(progress.remaining).toBe(15);
    expect(progress.reached).toBe(false);
    expect(progress.contributions.map((item) => [item.workoutId, item.sets, item.amount])).toEqual([['w1', 2, 35], ['w2', 1, 10]]);
  });

  it('counts reps for reps goals and marks reached', () => {
    const progress = dailyGoalProgress(goal({ measure: 'reps', target: 20 }), [set({ reps: 12 }), set({ reps: 10, durationSec: 30 })]);
    expect(progress.done).toBe(22);
    expect(progress.reached).toBe(true);
    expect(progress.remaining).toBe(0);
  });

  it('drops malformed stored goals', () => {
    const raw = JSON.stringify([goal({}), { id: 'x', scope: 'muscle', key: 'a', measure: 'reps', target: 5 }, goal({ id: 'y', target: 0 })]);
    expect(parseDailyGoals(raw).map((item) => item.id)).toEqual(['g']);
    expect(parseDailyGoals('not json')).toEqual([]);
  });
});

describe('weekly goals', () => {
  it('start on Monday, local time', () => {
    expect(startOfWeek(new Date(2026, 9, 14, 15))).toEqual(new Date(2026, 9, 12));
    expect(startOfWeek(new Date(2026, 9, 12, 0, 1))).toEqual(new Date(2026, 9, 12));
    expect(startOfWeek(new Date(2026, 9, 18, 23))).toEqual(new Date(2026, 9, 12));
    expect(startOfWeek(new Date(2026, 10, 1))).toEqual(new Date(2026, 9, 26));
  });

  it('allow bigger totals than a day, and sum sets of the whole week', () => {
    const big = JSON.stringify([goal({ target: 20 * 3600 })]);
    expect(parseDailyGoals(big, 'day')).toEqual([]);
    expect(parseDailyGoals(big, 'week')).toHaveLength(1);
    expect(targetMax('week', 'reps')).toBeGreaterThan(targetMax('day', 'reps'));
    const progress = dailyGoalProgress(goal({ measure: 'reps', target: 100 }), [
      set({ reps: 40, completedAt: new Date(2026, 9, 12, 9) }),
      set({ reps: 70, completedAt: new Date(2026, 9, 15, 9) }),
    ]);
    expect(progress).toMatchObject({ done: 110, reached: true, remaining: 0 });
  });
});
