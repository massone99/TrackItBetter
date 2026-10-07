import { ESTIMATED_SEC_PER_REP } from './mobilityPlan';
import { isValidRpe } from './rpe';
import { groupSets } from './setPairs';

/** 0 = Sunday … 6 = Saturday, as returned by Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Monday-first display order. */
export const WEEK_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export interface UserProgramExercise {
  id: string;
  exerciseId: string;
  sets: number;
  /** Reps, seconds or meters depending on the exercise metric; null leaves it open (see `note`). */
  target: number | null;
  /** Free text for the exercise, e.g. "6–8 reps, slow negatives"; copied to the exercise's note in the workout. */
  note?: string | null;
  /** Rest after each set; null or missing means "use the default rest" (per exercise, or Profile). */
  restSeconds?: number | null;
  /** Planned added load for weighted exercises; null or missing means "reuse last time's load". */
  loadKg?: number | null;
  /** Target RPE for every set; null or missing means no target. */
  rpe?: number | null;
  /** Target RPE set by set (index 0 is set 1); when present it wins over `rpe`. */
  rpePerSet?: (number | null)[] | null;
}

/** One workout of a program; programs rotate through them in order, on whatever days suit the user. */
export interface UserProgramSession {
  id: string;
  name: string;
  /** Free text for the whole prescribed workout (focus of the day, cues); copied to the workout's notes when it starts. */
  notes?: string | null;
  exercises: UserProgramExercise[];
}

export interface UserProgram {
  id: string;
  name: string;
  sessions: UserProgramSession[];
  updatedAt: string;
}

export type ProgramErrorCode = 'nameMissing' | 'sessionNameMissing' | 'sessionEmpty' | 'invalidValue';

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
  for (const session of program.sessions) {
    if (!session.name.trim()) errors.push({ code: 'sessionNameMissing', sessionId: session.id });
    if (session.exercises.length === 0) errors.push({ code: 'sessionEmpty', sessionId: session.id });
    for (const exercise of session.exercises) {
      if (!isValidPrescription({ ...exercise })) errors.push({ code: 'invalidValue', sessionId: session.id, exerciseId: exercise.id });
    }
  }
  return errors;
}

export const NOTE_MAX = 1000;

export function isValidPrescription(exercise: Partial<UserProgramExercise>): exercise is UserProgramExercise {
  return typeof exercise.id === 'string' && typeof exercise.exerciseId === 'string'
    && Number.isInteger(exercise.sets) && exercise.sets! > 0
    && (exercise.target === null || (Number.isFinite(exercise.target) && exercise.target! > 0))
    && (exercise.note === undefined || exercise.note === null || (typeof exercise.note === 'string' && exercise.note.length <= NOTE_MAX))
    && (exercise.restSeconds === undefined || exercise.restSeconds === null || (Number.isInteger(exercise.restSeconds) && exercise.restSeconds >= 0))
    && (exercise.loadKg === undefined || exercise.loadKg === null || (Number.isFinite(exercise.loadKg) && exercise.loadKg >= 0))
    && (exercise.rpe === undefined || exercise.rpe === null || isValidRpe(exercise.rpe))
    && (exercise.rpePerSet === undefined || exercise.rpePerSet === null || (Array.isArray(exercise.rpePerSet) && exercise.rpePerSet.every((value) => value === null || isValidRpe(value))));
}

/** The planned RPE of set `setIndex` (0-based): the per-set target when the program has one, else the shared one. */
export function targetRpeFor(exercise: Pick<UserProgramExercise, 'rpe' | 'rpePerSet'>, setIndex: number): number | null {
  if (exercise.rpePerSet) return exercise.rpePerSet[setIndex] ?? null;
  return exercise.rpe ?? null;
}

/** Per-set targets resized to `sets` (new sets repeat the last target), so they follow the Sets stepper. */
export function fitRpePerSet(values: readonly (number | null)[], sets: number): (number | null)[] {
  return Array.from({ length: Math.max(1, sets) }, (_, index) => values[index] ?? values[values.length - 1] ?? null);
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

/** A movement freshly added to a workout of a program: one set, no reps decided yet. */
/** What an open target counts as when a duration is estimated. */
export const DEFAULT_TARGET_FOR = (metric: string | undefined): number => DEFAULT_TARGET[measureOf(metric)];

export function newPrescription(exerciseId: string, metric: string | undefined, newId: () => string): UserProgramExercise {
  return { id: newId(), exerciseId, sets: 1, target: null, note: null, restSeconds: null, loadKg: null };
}

/**
 * The same prescription for another exercise: sets and rest stay; the target restarts at the new
 * exercise's default when the measure changes, and a load is kept only if the new exercise carries one.
 */
export function replaceExercise(prescription: UserProgramExercise, exerciseId: string, oldMetric: string | undefined, newMetric: string | undefined): UserProgramExercise {
  const sameMeasure = measureOf(oldMetric) === measureOf(newMetric);
  return {
    ...prescription,
    exerciseId,
    target: prescription.target !== null && sameMeasure ? prescription.target : null,
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

/** The session after the latest one done (`recentWorkoutNames` newest first), wrapping; the first when none was done; null for a program without workouts. */
export function nextSessionInRotation(program: UserProgram, recentWorkoutNames: readonly string[]): UserProgramSession | null {
  if (program.sessions.length === 0) return null;
  for (const name of recentWorkoutNames) {
    const index = program.sessions.findIndex((session) => programSessionWorkoutName(program, session) === name);
    if (index >= 0) return program.sessions[(index + 1) % program.sessions.length];
  }
  return program.sessions[0];
}

/**
 * Programs with a next workout, the one trained most recently first (the one Today puts forward);
 * the others keep their order. Programs never trained follow those that were.
 */
export function programsByRecentUse(programs: readonly UserProgram[], recentWorkoutNames: readonly string[]): { program: UserProgram; session: UserProgramSession }[] {
  const lastUse = (program: UserProgram) => {
    const index = recentWorkoutNames.findIndex((name) => program.sessions.some((session) => programSessionWorkoutName(program, session) === name));
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  };
  return programs
    .flatMap((program) => { const session = nextSessionInRotation(program, recentWorkoutNames); return session ? [{ program, session, used: lastUse(program) }] : []; })
    .sort((a, b) => a.used - b.used)
    .map(({ program, session }) => ({ program, session }));
}

export function sessionSetCount(session: Pick<UserProgramSession, 'exercises'>): number {
  return session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
}

/**
 * Rough length of a day: every set's work (hold seconds, or reps at ESTIMATED_SEC_PER_REP; distance
 * counts as a minute) plus the rest after each set except the last one of the day. Movements without
 * a rest of their own count `defaultRestSec`.
 */
export function estimateSessionSeconds(session: Pick<UserProgramSession, 'exercises'>, metricById: ReadonlyMap<string, string>, defaultRestSec = 90): number {
  let total = 0;
  let lastRest = 0;
  for (const exercise of session.exercises) {
    const metric = metricById.get(exercise.exerciseId);
    const target = exercise.target ?? DEFAULT_TARGET[measureOf(metric)];
    const work = isTimedMetric(metric) ? target : metric === 'distance' ? 60 : target * ESTIMATED_SEC_PER_REP;
    const rest = exercise.restSeconds ?? defaultRestSec;
    total += exercise.sets * (work + rest);
    lastRest = rest;
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

/** What a logged or in-progress set contributes to a planned exercise. */
export interface WorkoutSetLike {
  pairId?: string | null;
  side?: string;
  kind: string;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  restSec: number | null;
  targetRpe?: number | null;
}

export interface WorkoutExerciseLike {
  exerciseId: string;
  metric: string;
  notes: string | null;
  sets: readonly WorkoutSetLike[];
}

/**
 * A workout turned into a workout of a program: one movement per exercise, as many sets as the
 * working sets done (warm-ups only when there is nothing else), the first set's reps, hold or distance
 * as the target, its load and rest, and the exercise note. A set without a value leaves the target open.
 */
/** The workout's set targets as a program prescription: one shared value when they agree, else per set. */
function rpeTargetsOf(targets: (number | null)[]): Pick<UserProgramExercise, 'rpe' | 'rpePerSet'> {
  if (targets.every((value) => value === null)) return {};
  if (targets.every((value) => value === targets[0])) return { rpe: targets[0] };
  return { rpePerSet: targets };
}

export function sessionFromWorkout(name: string, exercises: readonly WorkoutExerciseLike[], newId: () => string): UserProgramSession {
  return {
    id: newId(),
    name: name.trim(),
    exercises: exercises.map((exercise) => {
      const working = exercise.sets.filter((set) => set.kind !== 'warmup');
      const used = working.length > 0 ? working : exercise.sets;
      const groups = groupSets(used);
      const first = groups[0]?.[0];
      const raw = !first ? null : isTimedMetric(exercise.metric) ? first.durationSec : exercise.metric === 'distance' ? first.distanceM : first.reps;
      const load = first && isLoadMetric(exercise.metric) && first.addedLoadKg !== 0 ? first.addedLoadKg : null;
      return {
        id: newId(),
        exerciseId: exercise.exerciseId,
        sets: Math.max(1, groups.length),
        target: raw && raw > 0 ? raw : null,
        note: exercise.notes?.trim() || null,
        restSeconds: first?.restSec != null && first.restSec >= 0 ? Math.round(first.restSec) : null,
        loadKg: load,
        ...rpeTargetsOf(groups.map((group) => group[0]?.targetRpe ?? null)),
      };
    }),
  };
}
