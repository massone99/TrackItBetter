import { estimateMaxHold, estimateMaxReps } from '../../domain';
import type { CompletedSetRow } from './summary';

/**
 * Capacity estimates for bodyweight work, read from each set's RPE. Loaded metrics are left out:
 * reps at different loads say nothing about one another.
 */

export type EstimateKind = 'reps' | 'hold';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

/** The max reps or max hold one set suggests, or null for an unrated or loaded set. */
export function setEstimate(row: Pick<CompletedSetRow, 'metric' | 'reps' | 'durationSec' | 'rpe'>): { kind: EstimateKind; value: number } | null {
  if (row.metric === 'reps') {
    const value = estimateMaxReps(row.reps, row.rpe);
    return value == null ? null : { kind: 'reps', value };
  }
  if (row.metric === 'time') {
    const value = estimateMaxHold(row.durationSec, row.rpe);
    return value == null ? null : { kind: 'hold', value };
  }
  return null;
}

export interface ExerciseEstimate {
  kind: EstimateKind;
  /** Best estimate of the most recent session with rated sets (later sets are tired, so not the last set); null when no set has an RPE yet. */
  latest: { value: number; date: Date; done: number; rpe: number } | null;
  /** Highest estimate in the last 30 days; null when the latest rated set is older. */
  recentBest: { value: number; date: Date } | null;
}

/** Null for exercises that cannot be estimated (loaded or distance) or have no completed sets. */
export function buildExerciseEstimate(rows: readonly CompletedSetRow[], exerciseId: string, now = new Date()): ExerciseEstimate | null {
  const exerciseRows = rows.filter((row) => row.exerciseId === exerciseId && row.completedAt);
  const metric = exerciseRows[0]?.metric;
  if (metric !== 'reps' && metric !== 'time') return null;
  let latest: ExerciseEstimate['latest'] = null;
  let latestSession = -Infinity;
  let recentBest: ExerciseEstimate['recentBest'] = null;
  const recentFrom = now.getTime() - RECENT_DAYS * DAY_MS;
  for (const row of exerciseRows) {
    const estimate = setEstimate(row);
    if (!estimate) continue;
    const date = row.completedAt!;
    const session = row.workoutStartedAt.getTime();
    if (!latest || session > latestSession || (session === latestSession && estimate.value > latest.value)) {
      latestSession = session;
      latest = { value: estimate.value, date, done: estimate.kind === 'reps' ? row.reps! : row.durationSec!, rpe: row.rpe! };
    }
    if (date.getTime() >= recentFrom && date.getTime() <= now.getTime() && (!recentBest || estimate.value > recentBest.value)) {
      recentBest = { value: estimate.value, date };
    }
  }
  return { kind: metric === 'reps' ? 'reps' : 'hold', latest, recentBest };
}
