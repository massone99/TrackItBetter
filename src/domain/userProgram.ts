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

export interface UserProgramSession {
  id: string;
  weekday: Weekday;
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

/** Copy of a day with fresh ids, placed on the next free weekday. */
export function duplicateSession(
  session: UserProgramSession,
  all: readonly UserProgramSession[],
  newId: () => string,
): UserProgramSession {
  return {
    ...session,
    id: newId(),
    weekday: nextFreeWeekday(all, session.weekday),
    exercises: session.exercises.map((exercise) => ({ ...exercise, id: newId() })),
  };
}

/** First weekday after `after` (Monday-first order, wrapping) that has no session; falls back to `after`'s next day. */
export function nextFreeWeekday(sessions: readonly Pick<UserProgramSession, 'weekday'>[], after?: Weekday): Weekday {
  const used = new Set(sessions.map((session) => session.weekday));
  const start = after === undefined ? 0 : WEEK_ORDER.indexOf(after) + 1;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = WEEK_ORDER[(start + offset) % 7];
    if (!used.has(day)) return day;
  }
  return WEEK_ORDER[start % 7];
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

/** Sessions of every program planned on `weekday`, with their program. */
export function sessionsForWeekday(programs: readonly UserProgram[], weekday: Weekday): { program: UserProgram; session: UserProgramSession }[] {
  return programs.flatMap((program) => program.sessions
    .filter((session) => session.weekday === weekday)
    .map((session) => ({ program, session })));
}

/** Sessions sorted Monday first, keeping the entered order within a day. */
export function sortByWeekday<T extends Pick<UserProgramSession, 'weekday'>>(sessions: readonly T[]): T[] {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => WEEK_ORDER.indexOf(a.session.weekday) - WEEK_ORDER.indexOf(b.session.weekday) || a.index - b.index)
    .map(({ session }) => session);
}

/** Per set loads for a new session: the planned load when set, otherwise last time's load at the same set index (or its last set). */
export function plannedLoads(exercise: Pick<UserProgramExercise, 'sets' | 'loadKg'>, previousLoads: readonly number[]): number[] {
  return Array.from({ length: exercise.sets }, (_, index) => {
    if (exercise.loadKg !== undefined && exercise.loadKg !== null) return exercise.loadKg;
    if (previousLoads.length === 0) return 0;
    return previousLoads[Math.min(index, previousLoads.length - 1)];
  });
}
