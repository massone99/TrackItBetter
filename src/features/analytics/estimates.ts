import { estimateMaxHold, estimateMaxReps, netLoadKg, oneRepMaxEstimate } from '../../domain';
import { getEffectiveLoad, type CompletedSetRow } from './summary';
import { aggregatePairs, realMean } from '../../domain/setPairs';

/**
 * Capacity estimates for bodyweight work, read from each set's RPE. Loaded metrics are left out:
 * reps at different loads say nothing about one another.
 */

export type EstimateKind = 'reps' | 'hold';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

/** The max reps or max hold one set suggests, or null for an unrated or loaded set. */
export function setEstimate(row: Pick<CompletedSetRow, 'metric' | 'reps' | 'durationSec' | 'rpe' | 'pairMembers' | 'bandCount'>): { kind: EstimateKind; value: number } | null {
  // A set helped by bands is not the same work as an unassisted one: it has its own estimate (see buildExerciseEstimate).
  if ((row.bandCount ?? 0) > 0) return null;
  if (row.pairMembers) {
    const value = realMean(row as CompletedSetRow, (side) => setEstimate(side)?.value);
    return value === null ? null : { kind: row.metric === 'reps' ? 'reps' : 'hold', value };
  }
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
  /**
   * What the estimate holds for: the net load of the latest rated set, in kg (added load minus help
   * from bands; negative is help). Null for plain bodyweight work. Estimates only compare sets with
   * the same net load.
   */
  condition: { netLoadKg: number } | null;
  /** Best estimate of the most recent session with rated sets (later sets are tired, so not the last set); null when no set has an RPE yet. */
  latest: { value: number; date: Date; done: number; rpe: number } | null;
  /** Highest estimate in the last 30 days; null when the latest rated set is older. */
  recentBest: { value: number; date: Date } | null;
}

/** The max reps or hold a set suggests, for any exercise but distance, at the set's own net load. */
function conditionalEstimate(row: CompletedSetRow): { kind: EstimateKind; value: number } | null {
  if (row.pairMembers) {
    const value = realMean(row, (side) => conditionalEstimate(side)?.value);
    return value === null ? null : { kind: row.metric === 'reps' || row.metric === 'reps_load' ? 'reps' : 'hold', value };
  }
  if (row.metric === 'reps' || row.metric === 'reps_load') {
    const value = estimateMaxReps(row.reps, row.rpe);
    return value == null ? null : { kind: 'reps', value };
  }
  if (row.metric === 'time' || row.metric === 'time_load') {
    const value = estimateMaxHold(row.durationSec, row.rpe);
    return value == null ? null : { kind: 'hold', value };
  }
  return null;
}

const sameLoad = (a: number, b: number) => Math.abs(a - b) < 0.05;
const rowNetLoad = (row: CompletedSetRow) => (row.pairMembers ? realMean(row, rowNetLoad) : netLoadKg(row.addedLoadKg, row.assistKg, row.bandCount));

/**
 * Null for exercises that cannot be estimated (distance) or have no completed sets. Loaded and
 * band-assisted work is estimated at one net load at a time, that of the latest rated set, since
 * reps at different loads say nothing about one another.
 */
export function buildExerciseEstimate(rows: readonly CompletedSetRow[], exerciseId: string, now = new Date()): ExerciseEstimate | null {
  rows = aggregatePairs(rows);
  const exerciseRows = rows.filter((row) => row.exerciseId === exerciseId && row.completedAt);
  const metric = exerciseRows[0]?.metric;
  if (metric !== 'reps' && metric !== 'time' && metric !== 'reps_load' && metric !== 'time_load') return null;
  const kind: EstimateKind = metric === 'reps' || metric === 'reps_load' ? 'reps' : 'hold';
  const rated = exerciseRows.filter((row) => rowNetLoad(row) !== null && conditionalEstimate(row));
  // The condition is that of the most recent rated set (latest session, then the latest set in it).
  const newest = rated.reduce<CompletedSetRow | null>((best, row) => (!best
    || row.workoutStartedAt.getTime() > best.workoutStartedAt.getTime()
    || (row.workoutStartedAt.getTime() === best.workoutStartedAt.getTime() && row.completedAt!.getTime() > best.completedAt!.getTime()) ? row : best), null);
  const load = newest ? rowNetLoad(newest) : null;
  const condition = load !== null && Math.abs(load) >= 0.05 ? { netLoadKg: Math.round(load * 10) / 10 } : null;
  let latest: ExerciseEstimate['latest'] = null;
  let latestSession = -Infinity;
  let recentBest: ExerciseEstimate['recentBest'] = null;
  const recentFrom = now.getTime() - RECENT_DAYS * DAY_MS;
  for (const row of rated) {
    if (load === null || !sameLoad(rowNetLoad(row)!, load)) continue;
    const estimate = conditionalEstimate(row)!;
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
  return { kind, condition, latest, recentBest };
}

export interface OneRepMaxEstimate {
  /** Effective load in kg (bodyweight share + load added − help from bands). */
  latest: { value: number; date: Date; reps: number; rpe: number | null; loadKg: number } | null;
  recentBest: { value: number; date: Date } | null;
  best: { value: number; date: Date } | null;
  /**
   * The one-rep max against the body: positive is load that could be added, negative the help
   * still needed for a single rep. Null for exercises without a bodyweight share.
   */
  vsBodyKg: number | null;
}

/** Estimated 1RM of an exercise from its rep sets: load or assistance, bodyweight share and RPE; null when no set allows one. */
export function buildOneRepMaxEstimate(rows: readonly CompletedSetRow[], exerciseId: string, now = new Date()): OneRepMaxEstimate | null {
  rows = aggregatePairs(rows);
  const own = rows.filter((row) => row.exerciseId === exerciseId && row.completedAt && (row.metric === 'reps' || row.metric === 'reps_load'));
  if (own.length === 0) return null;
  const estimateOf = (row: CompletedSetRow): number | null => realMean(row, (side) => oneRepMaxEstimate(getEffectiveLoad(side), side.reps, side.rpe));
  let latest: OneRepMaxEstimate['latest'] = null;
  let latestSession = -Infinity;
  let recentBest: OneRepMaxEstimate['recentBest'] = null;
  let best: OneRepMaxEstimate['best'] = null;
  let bodyRow: CompletedSetRow | null = null;
  const recentFrom = now.getTime() - RECENT_DAYS * DAY_MS;
  for (const row of own) {
    const value = estimateOf(row);
    if (value === null) continue;
    const date = row.completedAt!;
    const session = row.workoutStartedAt.getTime();
    if (!latest || session > latestSession || (session === latestSession && value > latest.value)) {
      latestSession = session;
      latest = { value, date, reps: row.reps!, rpe: row.rpe ?? null, loadKg: getEffectiveLoad(row) ?? 0 };
      bodyRow = row;
    }
    if (date.getTime() >= recentFrom && date.getTime() <= now.getTime() && (!recentBest || value > recentBest.value)) recentBest = { value, date };
    if (!best || value > best.value) best = { value, date };
  }
  if (!latest) return null;
  const vsBodyKg = bodyRow && bodyRow.leverageFactor != null && bodyRow.bodyweightKg != null
    ? Math.round((latest.value - bodyRow.bodyweightKg * bodyRow.leverageFactor) * 10) / 10 : null;
  return { latest, recentBest, best, vsBodyKg };
}
