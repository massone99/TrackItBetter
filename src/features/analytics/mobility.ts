import { rowCategories, type CompletedSetRow } from './summary';
import { aggregatePairs } from '../../domain/setPairs';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** True when mobility is any of the exercise's categories, main or extra. */
export function isMobilityRow(row: Pick<CompletedSetRow, 'category' | 'extraCategories'>): boolean {
  return rowCategories(row).includes('mobility');
}

/** Mobility and flexibility share one category; only holds carry time. */
export function isMobilityTimedSet(row: Pick<CompletedSetRow, 'category' | 'extraCategories' | 'metric' | 'durationSec'>): boolean {
  return isMobilityRow(row) && (row.metric === 'time' || row.metric === 'time_load') && (row.durationSec ?? 0) > 0;
}

function inLastWeek(row: Pick<CompletedSetRow, 'workoutStartedAt'>, now: Date): boolean {
  const time = row.workoutStartedAt.getTime();
  return time >= now.getTime() - WEEK_MS && time <= now.getTime();
}

/** Seconds spent in mobility holds during one workout. */
export function mobilitySecondsForWorkout(rows: readonly CompletedSetRow[], workoutId: string): number {
  rows = aggregatePairs(rows);
  return rows.reduce((sum, row) => (row.workoutId === workoutId && isMobilityTimedSet(row) ? sum + row.durationSec! : sum), 0);
}

export interface MobilityWeek {
  /** Seconds in mobility holds over the last 7 days. */
  seconds: number;
  /** Workouts in the last 7 days with at least one mobility set (holds or reps). */
  sessions: number;
}

export function buildMobilityWeek(rows: readonly CompletedSetRow[], now = new Date()): MobilityWeek {
  rows = aggregatePairs(rows);
  let seconds = 0;
  const sessions = new Set<string>();
  for (const row of rows) {
    if (!isMobilityRow(row) || !inLastWeek(row, now)) continue;
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
  rows = aggregatePairs(rows);
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

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * One exercise's own training week: it starts on the first day the exercise is trained and covers
 * that day plus the next six. Training it again after the week ends starts a new week.
 */
export interface ExerciseCycle {
  exerciseId: string;
  exerciseName: string;
  metric: string;
  /** Local midnight of the week's first day. */
  start: Date;
  /** Local midnight of the day after the week's last day. */
  end: Date;
  /** 1–7 while the week runs. */
  day: number;
  sets: number;
  sessions: number;
  /** Hold time; null for exercises measured in reps or distance. */
  seconds: number | null;
}

function cyclesFor(rows: readonly CompletedSetRow[]): { start: Date; rows: CompletedSetRow[] }[] {
  const sorted = [...rows].sort((a, b) => a.workoutStartedAt.getTime() - b.workoutStartedAt.getTime());
  const cycles: { start: Date; rows: CompletedSetRow[] }[] = [];
  for (const row of sorted) {
    const current = cycles.at(-1);
    if (current && row.workoutStartedAt < addDays(current.start, 7)) current.rows.push(row);
    else cycles.push({ start: startOfLocalDay(row.workoutStartedAt), rows: [row] });
  }
  return cycles;
}

function summarize(exerciseId: string, cycle: { start: Date; rows: CompletedSetRow[] }, now: Date): ExerciseCycle {
  const first = cycle.rows[0];
  const timed = first.metric === 'time' || first.metric === 'time_load';
  const dayMs = 24 * 60 * 60 * 1000;
  const day = Math.floor((startOfLocalDay(now).getTime() - cycle.start.getTime()) / dayMs + 0.5) + 1;
  return {
    exerciseId,
    exerciseName: first.exerciseName,
    metric: first.metric,
    start: cycle.start,
    end: addDays(cycle.start, 7),
    day: Math.min(7, Math.max(1, day)),
    sets: cycle.rows.length,
    sessions: new Set(cycle.rows.map((row) => row.workoutId)).size,
    seconds: timed ? cycle.rows.reduce((sum, row) => sum + (row.durationSec ?? 0), 0) : null,
  };
}

/** The exercise's week in progress, and the last finished one for comparison. */
export function buildExerciseCycle(rows: readonly CompletedSetRow[], exerciseId: string, now = new Date()): { current: ExerciseCycle | null; previous: ExerciseCycle | null } {
  rows = aggregatePairs(rows);
  const own = rows.filter((row) => row.exerciseId === exerciseId && row.workoutStartedAt <= now);
  const cycles = cyclesFor(own);
  const last = cycles.at(-1);
  const running = last && now < addDays(last.start, 7) ? last : null;
  const previous = running ? cycles.at(-2) : last;
  return {
    current: running ? summarize(exerciseId, running, now) : null,
    previous: previous ? summarize(exerciseId, previous, now) : null,
  };
}

/** Every mobility exercise with a week in progress, most recently started first. */
export function buildMobilityCycles(rows: readonly CompletedSetRow[], now = new Date()): ExerciseCycle[] {
  const ids = new Set(rows.filter(isMobilityRow).map((row) => row.exerciseId));
  return [...ids]
    .map((exerciseId) => buildExerciseCycle(rows, exerciseId, now).current)
    .filter((cycle): cycle is ExerciseCycle => cycle !== null)
    .sort((a, b) => b.start.getTime() - a.start.getTime() || a.exerciseName.localeCompare(b.exerciseName));
}
