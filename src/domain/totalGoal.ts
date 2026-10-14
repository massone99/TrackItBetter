import { amountOf, perSet, type ComparableSet } from './lastTime';

/** How far an exercise is towards its total goal, over its completed working sets (an L/R pair counts once). */
export interface TotalProgress {
  done: number;
  target: number;
  remaining: number;
  reached: boolean;
  /** How much the total went past the goal; 0 until it does. */
  over: number;
  /** 0–1, for a progress bar. */
  fraction: number;
}

const round = (value: number) => Math.round(value * 10) / 10;

export function totalProgress(sets: readonly ComparableSet[], metric: string, target: number): TotalProgress {
  const done = round(perSet(sets.filter((set) => set.completedAt), (set) => amountOf(set, metric)).reduce((sum, value) => sum + value, 0));
  const remaining = round(Math.max(0, target - done));
  return { done, target, remaining, reached: done >= target, over: round(Math.max(0, done - target)), fraction: target > 0 ? Math.min(1, done / target) : 0 };
}

/**
 * Where the next set under a total goal starts: the last set's value (or the planned per-set value),
 * never more than what is left; at least 1.
 */
export function nextSetValue(lastValue: number | null, remaining: number): number {
  const base = lastValue != null && lastValue > 0 ? lastValue : remaining;
  return Math.max(1, Math.round(Math.min(base, remaining)));
}
