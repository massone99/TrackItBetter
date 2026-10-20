import { dailyGoalProgress, deriveWeeklyGoals, goalMatches, parseDailyGoals, startOfWeek, targetMax, type DailyGoal, type DaySet } from '../dailyGoals';

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

  it('splits one tag by active or passive mobility, typeless exercises counting only in the plain goal', () => {
    const sets = [
      set({ durationSec: 30, mobilityMode: 'active' }),
      set({ durationSec: 20, mobilityMode: 'passive', completedAt: new Date(2026, 9, 15, 9) }),
      set({ durationSec: 10, mobilityMode: null, completedAt: new Date(2026, 9, 15, 10) }),
    ];
    expect(dailyGoalProgress(goal({}), sets).done).toBe(60);
    expect(dailyGoalProgress(goal({ mobilityMode: 'active' }), sets).done).toBe(30);
    expect(dailyGoalProgress(goal({ mobilityMode: 'passive' }), sets).done).toBe(20);
  });

  it('keeps the mobility type only on tag goals and when deriving weekly goals', () => {
    const raw = JSON.stringify([goal({ mobilityMode: 'passive' }), goal({ id: 'c', scope: 'category', key: 'mobility', mobilityMode: 'active' }), goal({ id: 'z', mobilityMode: 'weird' as never })]);
    expect(parseDailyGoals(raw).map((item) => item.id)).toEqual(['g']);
    const daily = [goal({ id: 'a', mobilityMode: 'active' }), goal({ id: 'p', mobilityMode: 'passive' })];
    const derived = deriveWeeklyGoals(daily, [goal({ id: 'w', mobilityMode: 'active' })], 7, () => 'new');
    expect(derived.add.map((item) => item.mobilityMode)).toEqual(['passive']);
    expect(derived.existing).toBe(1);
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

describe('one-sided sets', () => {
  it('count once: 10 reps on each side are 10, unequal sides their mean', () => {
    const reps = goal({ measure: 'reps', target: 100 });
    const side = (pairId: string, value: number, extra: Partial<DaySet> = {}) => set({ pairId, reps: value, ...extra });
    expect(dailyGoalProgress(reps, [side('p', 10), side('p', 10)]).done).toBe(10);
    expect(dailyGoalProgress(reps, [side('p', 10), side('p', 8)]).done).toBe(9);
    const two = dailyGoalProgress(reps, [side('p', 10), side('p', 10), side('q', 6), side('q', 6), set({ reps: 5 })]);
    expect(two.done).toBe(21);
    expect(two.contributions[0].sets).toBe(3);
  });

  it('count time the same way', () => {
    const time = goal({ measure: 'minutes', target: 600 });
    const side = (pairId: string, seconds: number) => set({ pairId, durationSec: seconds });
    expect(dailyGoalProgress(time, [side('p', 30), side('p', 30)]).done).toBe(30);
    expect(dailyGoalProgress(time, [side('p', 30), side('p', 40)]).done).toBe(35);
  });
});

describe('weekly goals from the daily ones', () => {
  let n = 0;
  const id = () => `new-${(n += 1)}`;
  const daily = [goal({ id: 'a', key: 'Hip flexion', target: 600 }), goal({ id: 'b', scope: 'category', key: 'push', measure: 'reps', target: 30 })];

  it('multiplies each daily total by the days of the week', () => {
    const result = deriveWeeklyGoals(daily, [], 5, id);
    expect(result.add.map(({ scope, key, measure, target }) => ({ scope, key, measure, target }))).toEqual([
      { scope: 'tag', key: 'Hip flexion', measure: 'minutes', target: 3000 },
      { scope: 'category', key: 'push', measure: 'reps', target: 150 },
    ]);
    expect(result).toMatchObject({ existing: 0, dropped: 0 });
    expect(new Set(result.add.map((item) => item.id)).size).toBe(2);
  });

  it('leaves a weekly goal that counts the same thing alone, edited or not', () => {
    const result = deriveWeeklyGoals(daily, [goal({ id: 'w', key: 'Hip flexion', target: 9999 })], 7, id);
    expect(result.add).toHaveLength(1);
    expect(result.add[0]).toMatchObject({ key: 'push', target: 210 });
    expect(result.existing).toBe(1);
  });

  it('stays within the weekly ceiling and the size of the list', () => {
    expect(deriveWeeklyGoals([goal({ measure: 'reps', target: 5000 })], [], 7, id).add[0].target).toBe(targetMax('week', 'reps'));
    const full = Array.from({ length: 20 }, (_, index) => goal({ id: `w${index}`, key: `tag-${index}` }));
    expect(deriveWeeklyGoals(daily, full, 7, id)).toMatchObject({ add: [], dropped: 2 });
  });
});
