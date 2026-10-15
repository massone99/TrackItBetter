/**
 * Daily goals: totals to reach today, summed over every set done today (mini sessions included).
 * A goal counts sets of one main category, one movement group or one movement tag, in minutes or reps.
 */
export type DailyGoalScope = 'category' | 'group' | 'tag';
export type DailyGoalMeasure = 'minutes' | 'reps';

export type DailyGoal = {
  id: string;
  scope: DailyGoalScope;
  /** Category id, movement group id or movement tag. */
  key: string;
  measure: DailyGoalMeasure;
  /** Seconds for minutes goals, reps for reps goals. */
  target: number;
};

/** A completed working set of today, with what the goals match on. */
export type DaySet = {
  workoutId: string;
  workoutName: string;
  exerciseId: string;
  exerciseName: string;
  completedAt: Date;
  reps: number | null;
  durationSec: number | null;
  categories: readonly string[];
  group: string | null;
  tags: readonly string[];
};

export type GoalContribution = {
  workoutId: string;
  workoutName: string;
  exerciseId: string;
  exerciseName: string;
  /** When the first set of this exercise in this workout was done. */
  at: Date;
  sets: number;
  amount: number;
};

export type DailyGoalProgress = {
  goal: DailyGoal;
  done: number;
  reached: boolean;
  remaining: number;
  /** Per workout and exercise, oldest first. */
  contributions: GoalContribution[];
};

const SCOPES: readonly DailyGoalScope[] = ['category', 'group', 'tag'];
const MEASURES: readonly DailyGoalMeasure[] = ['minutes', 'reps'];
export const MAX_DAILY_GOALS = 20;
export const DAILY_TARGET_MAX = { minutes: 6 * 3600, reps: 5000 } as const;

export function isValidDailyGoal(value: unknown): value is DailyGoal {
  if (!value || typeof value !== 'object') return false;
  const goal = value as Record<string, unknown>;
  return typeof goal.id === 'string' && goal.id.length > 0
    && SCOPES.includes(goal.scope as DailyGoalScope)
    && typeof goal.key === 'string' && goal.key.trim().length > 0
    && MEASURES.includes(goal.measure as DailyGoalMeasure)
    && typeof goal.target === 'number' && Number.isInteger(goal.target) && goal.target >= 1
    && goal.target <= DAILY_TARGET_MAX[goal.measure as DailyGoalMeasure];
}

/** Stored goals; anything malformed is dropped rather than breaking the screen. */
export function parseDailyGoals(raw: string | null | undefined): DailyGoal[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidDailyGoal).slice(0, MAX_DAILY_GOALS) : [];
  } catch {
    return [];
  }
}

export function sameGoalTarget(a: Pick<DailyGoal, 'scope' | 'key' | 'measure'>, b: Pick<DailyGoal, 'scope' | 'key' | 'measure'>): boolean {
  return a.scope === b.scope && a.key === b.key && a.measure === b.measure;
}

export function goalMatches(goal: Pick<DailyGoal, 'scope' | 'key'>, item: Pick<DaySet, 'categories' | 'group' | 'tags'>): boolean {
  if (goal.scope === 'category') return item.categories.includes(goal.key);
  if (goal.scope === 'group') return item.group === goal.key;
  return item.tags.includes(goal.key);
}

/** What a set adds: its seconds for minutes goals (timed sets only), its reps for reps goals. */
export function setAmount(measure: DailyGoalMeasure, set: Pick<DaySet, 'reps' | 'durationSec'>): number {
  const value = measure === 'minutes' ? set.durationSec : set.reps;
  return value != null && value > 0 ? value : 0;
}

export function dailyGoalProgress(goal: DailyGoal, sets: readonly DaySet[]): DailyGoalProgress {
  const byKey = new Map<string, GoalContribution>();
  let done = 0;
  for (const set of [...sets].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())) {
    if (!goalMatches(goal, set)) continue;
    const amount = setAmount(goal.measure, set);
    if (amount === 0) continue;
    done += amount;
    const key = `${set.workoutId}:${set.exerciseId}`;
    const current = byKey.get(key);
    if (current) { current.sets += 1; current.amount += amount; }
    else byKey.set(key, { workoutId: set.workoutId, workoutName: set.workoutName, exerciseId: set.exerciseId, exerciseName: set.exerciseName, at: set.completedAt, sets: 1, amount });
  }
  return { goal, done, reached: done >= goal.target, remaining: Math.max(0, goal.target - done), contributions: [...byKey.values()] };
}

/** Midnight today, local time: the day the goals count. */
export function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
