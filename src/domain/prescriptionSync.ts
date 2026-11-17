import { programSessionWorkoutName, sessionFromWorkout, type UserProgram, type UserProgramExercise, type UserProgramSession, type WorkoutExerciseLike } from './userProgram';

/** How a workout done differs from the prescribed workout it came from; exercises are named by id. */
export type PrescriptionChanges = {
  added: string[];
  removed: string[];
  reordered: boolean;
  /** Same exercise, different number of sets. */
  setsChanged: string[];
  /** Same exercise, different target, load or rest (only looked at when updating from a past workout). */
  valuesChanged: string[];
};

export type PrescribedMatch = { program: UserProgram; session: UserProgramSession };

/** The prescribed workout a workout was started from, found by its name (the most recently edited program first). */
export function findPrescribedWorkout(programs: readonly UserProgram[], workoutName: string): PrescribedMatch | null {
  const sorted = [...programs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const program of sorted) {
    const session = program.sessions.find((item) => programSessionWorkoutName(program, item) === workoutName);
    if (session) return { program, session };
  }
  return null;
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * The existing prescribed workout that saving a workout under `name` would clash with, if any: one
 * with that name in the program it is saved into, or the one the workout was started from when
 * `name` is that workout's name (as shown while training, or as named in its program). Saving as
 * new never touches it; only an explicit "replace" does.
 */
export function findNameClash(
  programs: readonly UserProgram[],
  input: { name: string; programId: string | null; source: PrescribedMatch | null; workoutName: string },
): PrescribedMatch | null {
  const target = input.programId ? programs.find((program) => program.id === input.programId) : undefined;
  const inTarget = target?.sessions.find((session) => sameName(session.name, input.name));
  if (target && inTarget) return { program: target, session: inTarget };
  const { source } = input;
  if (source && (sameName(input.name, input.workoutName) || sameName(input.name, source.session.name) || sameName(input.name, programSessionWorkoutName(source.program, source.session)))) return source;
  return null;
}

/** `name`, or "name (2)", "name (3)"… the first that is not in `taken`. */
export function uniqueSessionName(taken: readonly string[], name: string): string {
  const base = name.trim();
  if (!taken.some((item) => sameName(item, base))) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.some((item) => sameName(item, candidate))) return candidate;
  }
}

/** Pairs each exercise with the n-th time it appears, so an exercise done twice matches in order. */
function keyed<T extends { exerciseId: string }>(list: readonly T[]): Map<string, T> {
  const seen = new Map<string, number>();
  return new Map(list.map((item) => {
    const count = (seen.get(item.exerciseId) ?? 0) + 1;
    seen.set(item.exerciseId, count);
    return [`${item.exerciseId}#${count}`, item] as const;
  }));
}

/** The workout's exercises that were actually trained (at least one completed set). */
export function trainedExercises<S extends { completedAt?: Date | null }, T extends { sets: readonly S[] }>(exercises: readonly T[]): T[] {
  return exercises
    .map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.completedAt) }))
    .filter((exercise) => exercise.sets.length > 0);
}

export function prescriptionChanges(session: UserProgramSession, exercises: readonly WorkoutExerciseLike[]): PrescriptionChanges {
  const performed = sessionFromWorkout(session.name, exercises, () => 'x').exercises;
  const planned = keyed(session.exercises);
  const done = keyed(performed);
  const added = [...done].filter(([key]) => !planned.has(key)).map(([, item]) => item.exerciseId);
  const removed = [...planned].filter(([key]) => !done.has(key)).map(([, item]) => item.exerciseId);
  const common = [...done.keys()].filter((key) => planned.has(key));
  const order = (list: readonly UserProgramExercise[]) => [...keyed(list).keys()].filter((key) => common.includes(key));
  const reordered = order(session.exercises).join('|') !== order(performed).join('|');
  const setsChanged = common.filter((key) => (done.get(key)!.totalTarget ? null : done.get(key)!.sets) !== (planned.get(key)!.totalTarget ? null : planned.get(key)!.sets)).map((key) => done.get(key)!.exerciseId);
  const valuesChanged = common.filter((key) => {
    const a = planned.get(key)!;
    const b = done.get(key)!;
    return (a.target ?? null) !== (b.target ?? null) || (a.loadKg ?? null) !== (b.loadKg ?? null) || (a.restSeconds ?? null) !== (b.restSeconds ?? null);
  }).map((key) => done.get(key)!.exerciseId);
  return { added, removed, reordered, setsChanged, valuesChanged };
}

export const hasStructureChange = (changes: PrescriptionChanges) => changes.added.length + changes.removed.length + changes.setsChanged.length > 0 || changes.reordered;

/**
 * The prescribed workout after taking the workout done into it. `structure` follows the exercises, their
 * order and set counts and keeps everything else planned; `values` also takes the targets, loads, rest,
 * RPE and notes done. Name and notes of the prescribed workout stay.
 */
export function applyWorkoutToPrescription(session: UserProgramSession, exercises: readonly WorkoutExerciseLike[], mode: 'structure' | 'values', newId: () => string): UserProgramSession {
  const performed = sessionFromWorkout(session.name, exercises, newId).exercises;
  const planned = keyed(session.exercises);
  const seen = new Map<string, number>();
  const merged = performed.map((item) => {
    const count = (seen.get(item.exerciseId) ?? 0) + 1;
    seen.set(item.exerciseId, count);
    const before = planned.get(`${item.exerciseId}#${count}`);
    if (!before) return item;
    if (mode === 'values') return { ...item, id: before.id };
    return item.totalTarget ? { ...before, totalTarget: item.totalTarget, sets: 1 } : { ...before, sets: item.sets };
  });
  return { ...session, exercises: merged };
}
