import { estimateOneRepMax } from '../../domain/e1rm';
import { aggregatePairs, realMean, recordScope, samePairValue, type PairScope } from '../../domain/setPairs';

/** One completed working set, in chronological order. */
export interface RecordRow {
  setId: string;
  workoutId: string;
  exerciseId: string;
  metric: string;
  reps: number | null;
  durationSec: number | null;
  addedLoadKg: number;
  /** Load for the 1RM estimate (bodyweight share included when known); null when there is none. */
  effectiveLoadKg: number | null;
  /** Rest taken before this set (the rest set on the previous set of the exercise). */
  restBeforeSec: number | null;
  /** The stable identity of a unilateral L/R pair, when this set belongs to one. */
  pairId?: string | null;
  /** `left` or `right` for a unilateral set. Aggregated pairs use `average`. */
  side?: string;
  /** Members of the pair retained by aggregatePairs for derived metrics. */
  pairMembers?: readonly RecordRow[];
  /** Present for callers that pass incomplete in-progress rows to the aggregator. */
  completedAt?: unknown;
}

export type RecordScope = PairScope;

export type RecordKind = 'loadAtReps' | 'repsAtLoad' | 'holdAtLoad' | 'e1rm' | 'shorterRest';

export interface SetRecord {
  setId: string;
  exerciseId: string;
  kind: RecordKind;
  value: number;
  /** Best comparable value before this set. */
  previous: number;
  /** Scope is present for paired records so labels can distinguish average/L/R. */
  scope?: RecordScope;
}

/** Mini PR: an exercise's volume in one session above every earlier session. */
export interface VolumeRecord { exerciseId: string; value: number; previous: number; scope?: RecordScope }

const EPSILON = 1e-6;
const timed = (metric: string) => metric === 'time' || metric === 'time_load';
const loaded = (metric: string) => metric === 'reps_load' || metric === 'time_load';
const amountOf = (row: RecordRow) => (timed(row.metric) ? row.durationSec : row.reps) ?? 0;
/** Added load is signed: positive is load, zero is bodyweight, negative is assistance. */
const loadOf = (row: RecordRow) => row.addedLoadKg;

const aggregateRecordRows = (rows: readonly RecordRow[], scope: RecordScope): (RecordRow & { pairMembers?: readonly RecordRow[] })[] =>
  aggregatePairs(rows, scope);

const sameAmountWithinPair = (row: RecordRow) =>
  samePairValue(row, (side) => timed(side.metric) ? side.durationSec : side.reps);

const sameLoadWithinPair = (row: RecordRow) => samePairValue(row, (side) => side.addedLoadKg);

const sameLoad = (left: number, right: number) => Math.abs(left - right) <= EPSILON;

function sameRecordScope(left: RecordRow, right: RecordRow): boolean {
  return recordScope(left) === recordScope(right);
}

function scopedRows(rows: readonly RecordRow[], scope: RecordScope): RecordRow[] {
  return aggregateRecordRows(rows, scope);
}

function oneRepMaxForSide(row: RecordRow): number | null {
  if (row.metric !== 'reps_load' || row.effectiveLoadKg === null || row.effectiveLoadKg === undefined
    || row.effectiveLoadKg <= 0 || row.reps === null || row.reps === undefined || row.reps > 12) return null;
  try {
    return estimateOneRepMax(row.effectiveLoadKg, row.reps);
  } catch {
    return null;
  }
}

function oneRepMax(row: RecordRow): number | null {
  return realMean(row, oneRepMaxForSide);
}

const maxOf = (values: number[]) => (values.length ? Math.max(...values) : null);

/**
 * Records set in `workoutId`: each of its sets is compared with every earlier set of the exercise,
 * earlier sets of the same session included. An exercise done for the first time has no records.
 */
export function detectSetRecords(rows: readonly RecordRow[], workoutId: string, scope: RecordScope = 'average'): SetRecord[] {
  const records: SetRecord[] = [];
  const earlierByExercise = new Map<string, RecordRow[]>();
  for (const row of scopedRows(rows, scope)) {
    const earlier = earlierByExercise.get(row.exerciseId) ?? [];
    earlierByExercise.set(row.exerciseId, [...earlier, row]);
    if (row.workoutId !== workoutId || row.metric === 'distance') continue;
    if (!earlier.some((item) => item.workoutId !== workoutId)) continue;
    const amount = amountOf(row);
    if (amount <= 0) continue;
    const load = loadOf(row);
    const add = (kind: RecordKind, value: number, previous: number) => {
      const record: SetRecord = { setId: row.setId, exerciseId: row.exerciseId, kind, value, previous };
      if (row.pairId) record.scope = recordScope(row) as RecordScope;
      records.push(record);
    };

    if (loaded(row.metric) && sameAmountWithinPair(row)) {
      const previous = maxOf(earlier
        .filter((item) => sameRecordScope(item, row) && sameAmountWithinPair(item) && amountOf(item) >= amount)
        .map(loadOf));
      if (previous !== null && load > previous + EPSILON) add('loadAtReps', load, previous);
    }
    const previousAmount = sameLoadWithinPair(row)
      ? maxOf(earlier
        .filter((item) => sameRecordScope(item, row) && sameLoadWithinPair(item) && sameLoad(loadOf(item), load))
        .map(amountOf))
      : null;
    if (previousAmount !== null && amount > previousAmount) add(timed(row.metric) ? 'holdAtLoad' : 'repsAtLoad', amount, previousAmount);

    const e1rm = oneRepMax(row);
    const previousE1rm = maxOf(earlier
      .filter((item) => sameRecordScope(item, row))
      .map(oneRepMax)
      .filter((value): value is number => value !== null));
    if (e1rm !== null && previousE1rm !== null && e1rm > previousE1rm + EPSILON) add('e1rm', e1rm, previousE1rm);

    if (row.restBeforeSec !== null && sameAmountWithinPair(row) && sameLoadWithinPair(row)) {
      const comparable = earlier.filter((item) => sameRecordScope(item, row) && item.restBeforeSec !== null
        && sameAmountWithinPair(item) && sameLoadWithinPair(item)
        && amountOf(item) >= amount && loadOf(item) >= load - EPSILON);
      const shortest = comparable.length ? Math.min(...comparable.map((item) => item.restBeforeSec!)) : null;
      if (shortest !== null && row.restBeforeSec < shortest) add('shorterRest', row.restBeforeSec, shortest);
    }
  }
  return records;
}

/** kg·rep (or kg·s) for weighted exercises, otherwise total reps or seconds. */
function volumeOfSide(row: RecordRow): number {
  const amount = Math.max(0, amountOf(row));
  return loaded(row.metric) ? amount * Math.max(0, loadOf(row)) : amount;
}

function volumeOf(row: RecordRow): number {
  return realMean(row, volumeOfSide) ?? 0;
}

export function detectVolumeRecords(rows: readonly RecordRow[], workoutId: string, scope: RecordScope = 'average'): VolumeRecord[] {
  const sessions = new Map<string, Map<string, number>>();
  for (const row of scopedRows(rows, scope)) {
    if (row.metric === 'distance') continue;
    const key = `${row.exerciseId}\u0000${recordScope(row)}`;
    const byWorkout = sessions.get(key) ?? new Map<string, number>();
    byWorkout.set(row.workoutId, (byWorkout.get(row.workoutId) ?? 0) + volumeOf(row));
    sessions.set(key, byWorkout);
  }
  const records: VolumeRecord[] = [];
  for (const [key, byWorkout] of sessions) {
    const separator = key.indexOf('\u0000');
    const exerciseId = key.slice(0, separator);
    const rowScope = key.slice(separator + 1) as RecordScope;
    const value = byWorkout.get(workoutId);
    const previous = maxOf([...byWorkout].filter(([id]) => id !== workoutId).map(([, volume]) => volume));
    if (value !== undefined && previous !== null && value > previous + EPSILON) {
      const record: VolumeRecord = { exerciseId, value, previous };
      if (rowScope !== 'legacy') record.scope = rowScope;
      records.push(record);
    }
  }
  return records;
}

export interface ExerciseRecordSummary {
  /** Heaviest load for each rep count (weighted rep exercises), fewest reps first. */
  repMaxes: { reps: number; loadKg: number }[];
  /** Most reps, or longest hold in seconds, in one set. */
  bestAmount: number | null;
  bestE1rm: number | null;
  /** Largest session volume (see volumeOf). */
  bestVolume: number | null;
}

export function exerciseRecordSummary(rows: readonly RecordRow[], exerciseId: string, scope: RecordScope = 'average'): ExerciseRecordSummary {
  const hasPairData = scope === 'average' && rows.some((row) => row.exerciseId === exerciseId && !!row.pairId);
  const own = scopedRows(rows, scope).filter((row) => row.exerciseId === exerciseId && row.metric !== 'distance'
    && (!hasPairData || recordScope(row) === 'average'));
  const repMaxes = new Map<number, number>();
  const volumes = new Map<string, number>();
  for (const row of own) {
    if (row.metric === 'reps_load' && row.reps && sameAmountWithinPair(row) && loadOf(row) > 0) {
      repMaxes.set(row.reps, Math.max(repMaxes.get(row.reps) ?? 0, loadOf(row)));
    }
    volumes.set(row.workoutId, (volumes.get(row.workoutId) ?? 0) + volumeOf(row));
  }
  // A rep count only counts when no higher rep count was done with at least as much load.
  const sorted = [...repMaxes].sort(([a], [b]) => a - b);
  const kept = sorted.filter(([reps, load]) => !sorted.some(([other, otherLoad]) => other > reps && otherLoad >= load));
  return {
    repMaxes: kept.map(([reps, loadKg]) => ({ reps, loadKg })),
    bestAmount: maxOf(own.map(amountOf).filter((value) => value > 0)),
    bestE1rm: maxOf(own.map(oneRepMax).filter((value): value is number => value !== null)),
    bestVolume: maxOf([...volumes.values()].filter((value) => value > 0)),
  };
}
