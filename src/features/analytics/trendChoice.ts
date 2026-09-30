import { readPreference, writePreference } from '../../shared/settings/preferences';
import type { ExerciseTrend } from './summary';

const KEY = 'progress.trends';
export const TREND_LIMIT_DEFAULT = 8;
export const TREND_LIMIT_MAX = 12;

/** Which exercise trends the Progress tab shows: null ids = the most recent ones automatically. */
export interface TrendChoice {
  exerciseIds: string[] | null;
  limit: number;
}

export function readTrendChoice(): TrendChoice {
  try {
    const parsed = JSON.parse(readPreference(KEY) ?? 'null') as Partial<TrendChoice> | null;
    const ids = Array.isArray(parsed?.exerciseIds) ? parsed.exerciseIds.filter((id): id is string => typeof id === 'string') : null;
    const limit = typeof parsed?.limit === 'number' ? Math.min(TREND_LIMIT_MAX, Math.max(1, Math.round(parsed.limit))) : TREND_LIMIT_DEFAULT;
    return { exerciseIds: ids, limit };
  } catch {
    return { exerciseIds: null, limit: TREND_LIMIT_DEFAULT };
  }
}

export function writeTrendChoice(choice: TrendChoice): void {
  writePreference(KEY, JSON.stringify(choice));
}

export type TrendSlot = { exerciseId: string; trend: ExerciseTrend | null };

/**
 * The trends to show. Automatic: the most recent, up to the limit. Chosen: one per chosen exercise
 * in the chosen order (its most recent kind), with a null trend when it has too little data yet.
 */
export function selectTrends(trends: readonly ExerciseTrend[], choice: TrendChoice): TrendSlot[] {
  if (!choice.exerciseIds) return trends.slice(0, choice.limit).map((trend) => ({ exerciseId: trend.exerciseId, trend }));
  return choice.exerciseIds.slice(0, choice.limit).map((exerciseId) => ({
    exerciseId,
    trend: trends.find((trend) => trend.exerciseId === exerciseId) ?? null,
  }));
}
