import { dailyGoalProgress, startOfToday, startOfWeek, type DailyGoal, type DailyGoalProgress, type DaySet, type GoalPeriod } from './dailyGoals';

/** How a day (or week) went against the goals: nothing done, some goals reached, or all of them. */
export type PeriodStatus = 'empty' | 'partial' | 'all';

export type PeriodResult = {
  /** Local midnight of the day, or of the Monday of the week. */
  start: Date;
  progress: DailyGoalProgress[];
  reached: number;
  total: number;
  status: PeriodStatus;
  /** True for the day or week that has not ended yet. */
  current: boolean;
  future: boolean;
};

const key = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function periodStart(date: Date, period: GoalPeriod): Date {
  return period === 'week' ? startOfWeek(date) : startOfToday(date);
}

/** Starts of the `count` periods ending with the one of `end`, oldest first. */
export function periodStarts(end: Date, count: number, period: GoalPeriod): Date[] {
  const last = periodStart(end, period);
  const step = period === 'week' ? 7 : 1;
  return Array.from({ length: count }, (_, index) => new Date(last.getFullYear(), last.getMonth(), last.getDate() - (count - 1 - index) * step));
}

/**
 * Result of each period in `starts` against the goals as they are now (goals are the same every day
 * or week until changed, so the past is read with today's goals).
 */
export function periodResults(goals: readonly DailyGoal[], sets: readonly DaySet[], starts: readonly Date[], period: GoalPeriod, now: Date): PeriodResult[] {
  const buckets = new Map<string, DaySet[]>();
  for (const set of sets) {
    const id = key(periodStart(set.completedAt, period));
    const list = buckets.get(id);
    if (list) list.push(set); else buckets.set(id, [set]);
  }
  const today = periodStart(now, period).getTime();
  return starts.map((start) => {
    const progress = goals.map((goal) => dailyGoalProgress(goal, buckets.get(key(start)) ?? []));
    const reached = progress.filter((item) => item.reached).length;
    const total = progress.length;
    return {
      start, progress, reached, total,
      status: total > 0 && reached === total ? 'all' : reached > 0 || progress.some((item) => item.done > 0) ? 'partial' : 'empty',
      current: start.getTime() === today,
      future: start.getTime() > today,
    };
  });
}

/** Consecutive periods with every goal reached: the run up to now (an unfinished current period does not break it) and the best run. */
export function streaks(results: readonly PeriodResult[]): { current: number; best: number } {
  let best = 0;
  let run = 0;
  for (const result of results) {
    if (result.future) continue;
    if (result.status === 'all') { run += 1; best = Math.max(best, run); }
    else if (!result.current) run = 0;
  }
  return { current: run, best };
}
