import { estimateOneRepMax } from '../../domain/e1rm';

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
}

export type RecordKind = 'loadAtReps' | 'repsAtLoad' | 'holdAtLoad' | 'e1rm' | 'shorterRest';

export interface SetRecord {
  setId: string;
  exerciseId: string;
  kind: RecordKind;
  value: number;
  /** Best comparable value before this set. */
  previous: number;
}

/** Mini PR: an exercise's volume in one session above every earlier session. */
export interface VolumeRecord { exerciseId: string; value: number; previous: number }

const EPSILON = 1e-6;
const timed = (metric: string) => metric === 'time' || metric === 'time_load';
const loaded = (metric: string) => metric === 'reps_load' || metric === 'time_load';
const amountOf = (row: RecordRow) => (timed(row.metric) ? row.durationSec : row.reps) ?? 0;
const loadOf = (row: RecordRow) => Math.max(0, row.addedLoadKg);

function oneRepMax(row: RecordRow): number | null {
  if (row.metric !== 'reps_load' || !row.effectiveLoadKg || !row.reps || row.reps > 12) return null;
  try {
    return estimateOneRepMax(row.effectiveLoadKg, row.reps);
  } catch {
    return null;
  }
}

const maxOf = (values: number[]) => (values.length ? Math.max(...values) : null);

/**
 * Records set in `workoutId`: each of its sets is compared with every earlier set of the exercise,
 * earlier sets of the same session included. An exercise done for the first time has no records.
 */
export function detectSetRecords(rows: readonly RecordRow[], workoutId: string): SetRecord[] {
  const records: SetRecord[] = [];
  const earlierByExercise = new Map<string, RecordRow[]>();
  for (const row of rows) {
    const earlier = earlierByExercise.get(row.exerciseId) ?? [];
    earlierByExercise.set(row.exerciseId, [...earlier, row]);
    if (row.workoutId !== workoutId || row.metric === 'distance') continue;
    if (!earlier.some((item) => item.workoutId !== workoutId)) continue;
    const amount = amountOf(row);
    if (amount <= 0) continue;
    const load = loadOf(row);
    const add = (kind: RecordKind, value: number, previous: number) => records.push({ setId: row.setId, exerciseId: row.exerciseId, kind, value, previous });

    if (loaded(row.metric) && load > 0) {
      const previous = maxOf(earlier.filter((item) => amountOf(item) >= amount).map(loadOf));
      if (previous !== null && load > previous + EPSILON) add('loadAtReps', load, previous);
    }
    const previousAmount = maxOf(earlier.filter((item) => loadOf(item) >= load - EPSILON).map(amountOf));
    if (previousAmount !== null && amount > previousAmount) add(timed(row.metric) ? 'holdAtLoad' : 'repsAtLoad', amount, previousAmount);

    const e1rm = oneRepMax(row);
    const previousE1rm = maxOf(earlier.map(oneRepMax).filter((value): value is number => value !== null));
    if (e1rm !== null && previousE1rm !== null && e1rm > previousE1rm + EPSILON) add('e1rm', e1rm, previousE1rm);

    if (row.restBeforeSec !== null) {
      const comparable = earlier.filter((item) => item.restBeforeSec !== null && amountOf(item) >= amount && loadOf(item) >= load - EPSILON);
      const shortest = comparable.length ? Math.min(...comparable.map((item) => item.restBeforeSec!)) : null;
      if (shortest !== null && row.restBeforeSec < shortest) add('shorterRest', row.restBeforeSec, shortest);
    }
  }
  return records;
}

/** kg·rep (or kg·s) for weighted exercises, otherwise total reps or seconds. */
function volumeOf(row: RecordRow): number {
  const amount = Math.max(0, amountOf(row));
  return loaded(row.metric) ? amount * loadOf(row) : amount;
}

export function detectVolumeRecords(rows: readonly RecordRow[], workoutId: string): VolumeRecord[] {
  const sessions = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.metric === 'distance') continue;
    const byWorkout = sessions.get(row.exerciseId) ?? new Map<string, number>();
    byWorkout.set(row.workoutId, (byWorkout.get(row.workoutId) ?? 0) + volumeOf(row));
    sessions.set(row.exerciseId, byWorkout);
  }
  const records: VolumeRecord[] = [];
  for (const [exerciseId, byWorkout] of sessions) {
    const value = byWorkout.get(workoutId);
    const previous = maxOf([...byWorkout].filter(([id]) => id !== workoutId).map(([, volume]) => volume));
    if (value !== undefined && previous !== null && value > previous + EPSILON) records.push({ exerciseId, value, previous });
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

export function exerciseRecordSummary(rows: readonly RecordRow[], exerciseId: string): ExerciseRecordSummary {
  const own = rows.filter((row) => row.exerciseId === exerciseId && row.metric !== 'distance');
  const repMaxes = new Map<number, number>();
  const volumes = new Map<string, number>();
  for (const row of own) {
    if (row.metric === 'reps_load' && row.reps && loadOf(row) > 0) repMaxes.set(row.reps, Math.max(repMaxes.get(row.reps) ?? 0, loadOf(row)));
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
