import type { CompletedSetRow } from './summary';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Mobility and flexibility share one category; only holds carry time. */
export function isMobilityTimedSet(row: Pick<CompletedSetRow, 'category' | 'metric' | 'durationSec'>): boolean {
  return row.category === 'mobility' && (row.metric === 'time' || row.metric === 'time_load') && (row.durationSec ?? 0) > 0;
}

function inLastWeek(row: Pick<CompletedSetRow, 'workoutStartedAt'>, now: Date): boolean {
  const time = row.workoutStartedAt.getTime();
  return time >= now.getTime() - WEEK_MS && time <= now.getTime();
}

/** Seconds spent in mobility holds during one workout. */
export function mobilitySecondsForWorkout(rows: readonly CompletedSetRow[], workoutId: string): number {
  return rows.reduce((sum, row) => (row.workoutId === workoutId && isMobilityTimedSet(row) ? sum + row.durationSec! : sum), 0);
}

export interface MobilityWeek {
  /** Seconds in mobility holds over the last 7 days. */
  seconds: number;
  /** Workouts in the last 7 days with at least one mobility set (holds or reps). */
  sessions: number;
}

export function buildMobilityWeek(rows: readonly CompletedSetRow[], now = new Date()): MobilityWeek {
  let seconds = 0;
  const sessions = new Set<string>();
  for (const row of rows) {
    if (row.category !== 'mobility' || !inLastWeek(row, now)) continue;
    sessions.add(row.workoutId);
    if (isMobilityTimedSet(row)) seconds += row.durationSec!;
  }
  return { seconds, sessions: sessions.size };
}

export interface ExerciseWeek {
  sets: number;
  /** Distinct workouts that trained the exercise. */
  sessions: number;
  /** Hold time; null for exercises measured in reps or distance. */
  seconds: number | null;
}

/** Last-7-days volume and frequency of one exercise. */
export function buildExerciseWeek(rows: readonly CompletedSetRow[], exerciseId: string, metric: string, now = new Date()): ExerciseWeek {
  const timed = metric === 'time' || metric === 'time_load';
  let sets = 0;
  let seconds = 0;
  const sessions = new Set<string>();
  for (const row of rows) {
    if (row.exerciseId !== exerciseId || !inLastWeek(row, now)) continue;
    sets += 1;
    sessions.add(row.workoutId);
    seconds += row.durationSec ?? 0;
  }
  return { sets, sessions: sessions.size, seconds: timed ? seconds : null };
}
