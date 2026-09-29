import { ESTIMATED_SEC_PER_REP } from './mobilityPlan';

/** 0 = Sunday … 6 = Saturday, as returned by Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Monday-first display order. */
export const WEEK_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** i18n key suffix for `reminders.weekdays.*` and `reminders.weekdaysShort.*`. */
export function weekdayKey(day: number): string {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] ?? 'mon';
}

export interface UserProgramExercise {
  id: string;
  exerciseId: string;
  sets: number;
  /** Reps, seconds or meters depending on the exercise metric. */
  target: number;
  restSeconds: number;
  /** Planned added load for weighted exercises; null or missing means "reuse last time's load". */
  loadKg?: number | null;
}

/** One workout of a program; programs rotate through them in order, on whatever days suit the user. */
export interface UserProgramSession {
  id: string;
  name: string;
  exercises: UserProgramExercise[];
}

export interface UserProgram {
  id: string;
  name: string;
  sessions: UserProgramSession[];
  updatedAt: string;
}

export type ProgramErrorCode = 'nameMissing' | 'noSessions' | 'sessionNameMissing' | 'sessionEmpty' | 'invalidValue';

export interface ProgramError {
  code: ProgramErrorCode;
  sessionId?: string;
  exerciseId?: string;
}

export function isTimedMetric(metric: string | undefined): boolean {
  return metric === 'time' || metric === 'time_load';
}

export function isLoadMetric(metric: string | undefined): boolean {
  return metric === 'reps_load' || metric === 'time_load';
}

/** Every problem that stops a program from being saved, in the order they appear on screen. */
export function validateUserProgram(program: Pick<UserProgram, 'name' | 'sessions'>): ProgramError[] {
  const errors: ProgramError[] = [];
  if (!program.name.trim()) errors.push({ code: 'nameMissing' });
  if (program.sessions.length === 0) errors.push({ code: 'noSessions' });
  for (const session of program.sessions) {
    if (!session.name.trim()) errors.push({ code: 'sessionNameMissing', sessionId: session.id });
    if (session.exercises.length === 0) errors.push({ code: 'sessionEmpty', sessionId: session.id });
    for (const exercise of session.exercises) {
      if (!isValidPrescription({ ...exercise })) errors.push({ code: 'invalidValue', sessionId: session.id, exerciseId: exercise.id });
    }
  }
  return errors;
}

export function isValidPrescription(exercise: Partial<UserProgramExercise>): exercise is UserProgramExercise {
  return typeof exercise.id === 'string' && typeof exercise.exerciseId === 'string'
    && Number.isInteger(exercise.sets) && exercise.sets! > 0
    && Number.isFinite(exercise.target) && exercise.target! > 0
    && Number.isInteger(exercise.restSeconds) && exercise.restSeconds! >= 0
    && (exercise.loadKg === undefined || exercise.loadKg === null || (Number.isFinite(exercise.loadKg) && exercise.loadKg >= 0));
}

/** Returns a copy with the item at `index` moved by `delta` places; out-of-range moves return the list unchanged. */
export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** Reps, holds and distances are different measures: a target in one means nothing in another. */
export function measureOf(metric: string | undefined): 'time' | 'distance' | 'reps' {
  return isTimedMetric(metric) ? 'time' : metric === 'distance' ? 'distance' : 'reps';
}

const DEFAULT_TARGET = { time: 30, distance: 100, reps: 8 } as const;

/**
 * The same prescription for another exercise: sets and rest stay; the target restarts at the new
 * exercise's default when the measure changes, and a load is kept only if the new exercise carries one.
 */
export function replaceExercise(prescription: UserProgramExercise, exerciseId: string, oldMetric: string | undefined, newMetric: string | undefined): UserProgramExercise {
  const sameMeasure = measureOf(oldMetric) === measureOf(newMetric);
  return {
    ...prescription,
    exerciseId,
    target: sameMeasure ? prescription.target : DEFAULT_TARGET[measureOf(newMetric)],
    loadKg: isLoadMetric(newMetric) ? prescription.loadKg ?? null : null,
  };
}

/** Copy of a workout with fresh ids. */
export function duplicateSession(session: UserProgramSession, newId: () => string): UserProgramSession {
  return { ...session, id: newId(), exercises: session.exercises.map((exercise) => ({ ...exercise, id: newId() })) };
}

/** Name given to a workout started from a program session; also how the rotation recognises it. */
export function programSessionWorkoutName(program: Pick<UserProgram, 'name'>, session: Pick<UserProgramSession, 'name'>): string {
  return `${program.name} · ${session.name}`;
}

/** The session after the latest one done (`recentWorkoutNames` newest first), wrapping; the first when none was done. */
export function nextSessionInRotation(program: UserProgram, recentWorkoutNames: readonly string[]): UserProgramSession {
  for (const name of recentWorkoutNames) {
    const index = program.sessions.findIndex((session) => programSessionWorkoutName(program, session) === name);
    if (index >= 0) return program.sessions[(index + 1) % program.sessions.length];
  }
  return program.sessions[0];
}

export function sessionSetCount(session: Pick<UserProgramSession, 'exercises'>): number {
  return session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
}

/**
 * Rough length of a day: every set's work (hold seconds, or reps at ESTIMATED_SEC_PER_REP; distance
 * counts as a minute) plus the rest after each set except the last one of the day.
 */
export function estimateSessionSeconds(session: Pick<UserProgramSession, 'exercises'>, metricById: ReadonlyMap<string, string>): number {
  let total = 0;
  let lastRest = 0;
  for (const exercise of session.exercises) {
    const metric = metricById.get(exercise.exerciseId);
    const work = isTimedMetric(metric) ? exercise.target : metric === 'distance' ? 60 : exercise.target * ESTIMATED_SEC_PER_REP;
    total += exercise.sets * (work + exercise.restSeconds);
    lastRest = exercise.restSeconds;
  }
  return Math.max(0, total - lastRest);
}

/** Per set loads for a new session: the planned load when set, otherwise last time's load at the same set index (or its last set). */
export function plannedLoads(exercise: Pick<UserProgramExercise, 'sets' | 'loadKg'>, previousLoads: readonly number[]): number[] {
  return Array.from({ length: exercise.sets }, (_, index) => {
    if (exercise.loadKg !== undefined && exercise.loadKg !== null) return exercise.loadKg;
    if (previousLoads.length === 0) return 0;
    return previousLoads[Math.min(index, previousLoads.length - 1)];
  });
}
