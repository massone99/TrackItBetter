import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, max, or } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { bodyMeasurements, exerciseEntries, exercises, formCheckVideos, trainingSets, workouts } from '../../db/schema';
import { deleteFormCheckVideosForSets } from '../media/formVideos';
import { isValidRpe } from '../../domain/rpe';
import { isLoadMetric, measureOf } from '../../domain/userProgram';
import type { SetKind } from './restDefaults';
import { formatSupersetType, type SupersetRest } from './superset';
import { groupSets, completedSetCount, validatePairs } from '../../domain/setPairs';

export interface SessionSet {
  pairId?: string | null;
  side?: string;
  id: string;
  index: number;
  /** Warm-ups stay out of statistics, records and previous values, and use their own rest. */
  kind: SetKind;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  restSec: number | null;
  /** Rate of perceived exertion, 6–10 in half steps. */
  rpe: number | null;
  note: string | null;
  /** Number of form-check clips the user attached to this set. */
  clipCount: number;
  completedAt: Date | null;
}

export interface SessionExercise {
  unilateral?: boolean;
  unilateralRestMode?: 'side' | 'pair';
  unilateralRestOverride?: 'side' | 'pair' | null;
  entryId: string;
  exerciseId: string;
  name: string;
  metric: string;
  /** Link to a reference video showing good form, if one was attached to the exercise. */
  demoUrl: string | null;
  /** Free-text note for this exercise within the workout. */
  notes: string | null;
  /** Exercises sharing a group id form a superset; the type holds its rest mode (see superset.ts). */
  groupId: string | null;
  groupType: string | null;
  sets: SessionSet[];
}

export interface ActiveWorkout {
  id: string;
  name: string;
  startedAt: Date;
  sleep: number | null;
  energy: number | null;
  soreness: number | null;
  exercises: SessionExercise[];
}

export interface WorkoutHistoryItem {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date;
  setCount: number;
}

export interface CompletedWorkout extends ActiveWorkout {
  endedAt: Date;
}

const id = () => Crypto.randomUUID();

async function pairCondition(setId: string) {
  const [set] = await db.select().from(trainingSets).where(eq(trainingSets.id, setId));
  return set?.pairId ? eq(trainingSets.pairId, set.pairId) : eq(trainingSets.id, setId);
}

async function assertSetWorkout(setId: string, workoutId: string) {
  const [row] = await db.select({ workoutId: exerciseEntries.workoutId }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id)).where(eq(trainingSets.id, setId));
  if (row?.workoutId !== workoutId) throw new Error('Set does not belong to workout');
}

async function requireActiveSet(setId: string) {
  const [row] = await db.select({ endedAt: workouts.endedAt }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id)).where(eq(trainingSets.id, setId));
  if (!row || row.endedAt) throw new Error('Use the completed workout editor');
}

export async function setUnilateralRest(entryId: string, mode: 'side' | 'pair' | null, habitual = false): Promise<void> {
  await initializeDatabase();
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  if (!entry) throw new Error('Exercise not found');
  if (mode !== null && mode !== 'side' && mode !== 'pair') throw new Error('Invalid rest mode');
  await db.transaction(async (tx) => {
    if (habitual && mode) await tx.update(exercises).set({ unilateralRestMode: mode }).where(eq(exercises.id, entry.exerciseId));
    await tx.update(exerciseEntries).set({ unilateralRestMode: habitual ? null : mode }).where(eq(exerciseEntries.id, entryId));
  });
}

export type PairEditValues = Pick<SessionSet, 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg' | 'rpe'>;

function validatePairValues(left: PairEditValues, right: PairEditValues) {
  for (const values of [left, right]) {
    for (const field of ['reps', 'durationSec', 'distanceM', 'addedLoadKg'] as const) {
      const v = values[field];
      if (v !== null && (!Number.isFinite(v) || (field !== 'addedLoadKg' && v < 0) || ((field === 'reps' || field === 'durationSec') && !Number.isInteger(v)))) throw new Error('Invalid set value');
    }
    if (values.rpe !== null && !isValidRpe(values.rpe)) throw new Error('Invalid RPE');
  }
}

export async function addCompletedPair(workoutId: string, entryId: string, left: PairEditValues, right: PairEditValues): Promise<string> {
  await initializeDatabase();
  await completedWorkoutEnd(workoutId);
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  if (entry?.workoutId !== workoutId) throw new Error('Exercise does not belong to workout');
  validatePairValues(left, right);
  return addSet(entryId, { left, right });
}

/** Explicit conversion preserves the original row id (and therefore its note and videos). */
export async function saveCompletedPair(workoutId: string, setId: string, originalSide: 'left' | 'right', left: PairEditValues, right: PairEditValues, otherSetId?: string): Promise<void> {
  await initializeDatabase();
  const endedAt = await completedWorkoutEnd(workoutId);
  await assertSetWorkout(setId, workoutId);
  for (const values of [left, right]) {
    for (const field of ['reps', 'durationSec', 'distanceM', 'addedLoadKg'] as const) {
      const v = values[field];
      if (v !== null && (!Number.isFinite(v) || (field !== 'addedLoadKg' && v < 0) || ((field === 'reps' || field === 'durationSec') && !Number.isInteger(v)))) throw new Error('Invalid set value');
    }
    if (values.rpe !== null && !isValidRpe(values.rpe)) throw new Error('Invalid RPE');
  }
  await db.transaction(async (tx) => {
    const [original] = await tx.select().from(trainingSets).where(eq(trainingSets.id, setId));
    const pairId = original.pairId ?? id();
    const side = original.pairId ? original.side : originalSide;
    const other = original.pairId ? (await tx.select().from(trainingSets).where(eq(trainingSets.pairId, pairId))).find((s) => s.id !== setId)
      : otherSetId ? (await tx.select().from(trainingSets).where(eq(trainingSets.id, otherSetId)))[0] : null;
    if (otherSetId && (!other || other.id === original.id || other.entryId !== original.entryId || other.kind !== original.kind || other.pairId)) throw new Error('Invalid legacy pair association');
    await tx.update(trainingSets).set({ ...(side === 'left' ? left : right), side, pairId, completedAt: endedAt }).where(eq(trainingSets.id, setId));
    const values = { ...(side === 'left' ? right : left), side: side === 'left' ? 'right' : 'left', pairId, index: original.index, completedAt: endedAt };
    if (other) await tx.update(trainingSets).set(values).where(eq(trainingSets.id, other.id));
    else await tx.insert(trainingSets).values({ ...original, ...values, id: id(), pairId, note: null });
    if (otherSetId) {
      const rows = await tx.select().from(trainingSets).where(eq(trainingSets.entryId, original.entryId)).orderBy(asc(trainingSets.index));
      for (const [position, group] of groupSets(rows).entries()) {
        for (const row of group) await tx.update(trainingSets).set({ index: position + 1 }).where(eq(trainingSets.id, row.id));
      }
    }
  });
}

export async function startWorkout(name = 'Workout'): Promise<string> {
  await initializeDatabase();
  const [latestBodyweight] = await db
    .select({ value: bodyMeasurements.value, unit: bodyMeasurements.unit })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.kind, 'weight'))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(1);
  const workoutId = id();
  await db.insert(workouts).values({
    id: workoutId,
    name,
    startedAt: new Date(),
    bodyweightKg: latestBodyweight
      ? latestBodyweight.unit === 'lb' ? latestBodyweight.value * 0.45359237 : latestBodyweight.value
      : null,
  });
  return workoutId;
}

export async function getActiveWorkout(id?: string): Promise<ActiveWorkout | null> {
  await initializeDatabase();
  const [workout] = await db
    .select()
    .from(workouts)
    .where(id ? eq(workouts.id, id) : isNull(workouts.endedAt))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  if (!workout || workout.endedAt) return null;

  const sessionExercises = await loadSessionExercises(workout.id);

  return {
    id: workout.id,
    name: workout.name,
    startedAt: workout.startedAt,
    sleep: workout.sleep,
    energy: workout.energy,
    soreness: workout.soreness,
    exercises: sessionExercises,
  };
}

export async function updateWorkoutReadiness(
  workoutId: string,
  field: 'sleep' | 'energy' | 'soreness',
  value: number,
): Promise<void> {
  await initializeDatabase();
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new RangeError('Readiness ratings must be integers from 1 to 5');
  }
  await db.update(workouts).set({ [field]: value }).where(and(eq(workouts.id, workoutId), isNull(workouts.endedAt)));
}

async function loadSessionExercises(workoutId: string): Promise<SessionExercise[]> {
  const entries = await db
    .select({ entry: exerciseEntries, exercise: exercises })
    .from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .where(eq(exerciseEntries.workoutId, workoutId))
    .orderBy(asc(exerciseEntries.order));
  const clipRows = await db
    .select({ setId: formCheckVideos.setId, value: count(formCheckVideos.id) })
    .from(formCheckVideos)
    .where(eq(formCheckVideos.workoutId, workoutId))
    .groupBy(formCheckVideos.setId);
  const clipsBySet = new Map(clipRows.map((row) => [row.setId, row.value]));

  return Promise.all(entries.map(async ({ entry, exercise }) => {
    const sets = await db.select().from(trainingSets)
      .where(eq(trainingSets.entryId, entry.id)).orderBy(asc(trainingSets.index));
    return {
      entryId: entry.id,
      exerciseId: exercise.id,
      name: exercise.name,
      metric: exercise.metric,
      unilateral: exercise.unilateral,
      unilateralRestMode: entry.unilateralRestMode ?? exercise.unilateralRestMode,
      unilateralRestOverride: entry.unilateralRestMode,
      demoUrl: exercise.demoUrl,
      notes: entry.notes,
      groupId: entry.groupId,
      groupType: entry.groupType,
      sets: sets.map((set) => ({
        id: set.id,
        pairId: set.pairId,
        side: set.side,
        index: set.index,
        kind: set.kind === 'warmup' ? 'warmup' as const : 'working' as const,
        reps: set.reps,
        durationSec: set.durationSec,
        distanceM: set.distanceM,
        addedLoadKg: set.addedLoadKg,
        restSec: set.restSec,
        rpe: set.rpe,
        note: set.note,
        clipCount: clipsBySet.get(set.id) ?? 0,
        completedAt: set.completedAt,
      })),
    };
  }));
}

/** Read a finished workout for review/editing without reopening its lifecycle. */
export async function getCompletedWorkout(workoutId: string): Promise<CompletedWorkout | null> {
  await initializeDatabase();
  const [workout] = await db.select().from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  if (!workout?.endedAt) return null;

  const sessionExercises = await loadSessionExercises(workout.id);

  return {
    id: workout.id,
    name: workout.name,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    sleep: workout.sleep,
    energy: workout.energy,
    soreness: workout.soreness,
    exercises: sessionExercises,
  };
}

/** Update a set only when it belongs to a finished workout. Its completion time and
 * workout endedAt are deliberately untouched, so an edit cannot resume a session. */
export async function updateCompletedWorkoutSet(
  workoutId: string,
  setId: string,
  field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg',
  value: number,
): Promise<void> {
  await initializeDatabase();
  if (!Number.isFinite(value) || (field !== 'addedLoadKg' && value < 0)
    || ((field === 'reps' || field === 'durationSec') && !Number.isInteger(value))) {
    throw new Error('Invalid workout set value');
  }
  const [row] = await db.select({ workoutId: exerciseEntries.workoutId, endedAt: workouts.endedAt })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(eq(trainingSets.id, setId)).limit(1);
  if (!row || row.workoutId !== workoutId || !row.endedAt) {
    throw new Error('Set does not belong to a completed workout');
  }
  const normalized = field === 'distanceM' ? Math.round(value * 100) / 100 : value;
  if (field === 'reps') {
    await db.update(trainingSets).set({ reps: normalized }).where(eq(trainingSets.id, setId));
  } else if (field === 'durationSec') {
    await db.update(trainingSets).set({ durationSec: normalized }).where(eq(trainingSets.id, setId));
  } else if (field === 'distanceM') {
    await db.update(trainingSets).set({ distanceM: normalized }).where(eq(trainingSets.id, setId));
  } else {
    await db.update(trainingSets).set({ addedLoadKg: normalized }).where(eq(trainingSets.id, setId));
  }
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
): Promise<string> {
  await initializeDatabase();
  const [lastOrder] = await db
    .select({ value: max(exerciseEntries.order) })
    .from(exerciseEntries)
    .where(eq(exerciseEntries.workoutId, workoutId));
  const entryId = id();
  await db.insert(exerciseEntries).values({
    id: entryId,
    workoutId,
    exerciseId,
    order: (lastOrder?.value ?? 0) + 1,
  });
  await addSet(entryId);
  return entryId;
}

export async function addSet(entryId: string, pairValues?: { left: PairEditValues; right: PairEditValues }): Promise<string> {
  await initializeDatabase();
  if (pairValues) validatePairValues(pairValues.left, pairValues.right);
  const [entryExercise] = await db
    .select({ metric: exercises.metric, unilateral: exercises.unilateral, endedAt: workouts.endedAt })
    .from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(eq(exerciseEntries.id, entryId))
    .limit(1);
  const [previous] = await db
    .select()
    .from(trainingSets)
    .where(eq(trainingSets.entryId, entryId))
    .orderBy(desc(trainingSets.index))
    .limit(1);
  const setId = id();
  const initialValue = entryExercise?.metric === 'time' || entryExercise?.metric === 'time_load'
    ? { durationSec: 10 }
    : entryExercise?.metric === 'distance'
      ? { distanceM: 10 }
      : { reps: 8 };
  const values = {
    id: setId,
    entryId,
    index: (previous?.index ?? 0) + 1,
    kind: previous?.kind ?? 'working',
    reps: previous?.reps ?? ('reps' in initialValue ? initialValue.reps : null),
    durationSec: previous?.durationSec ?? ('durationSec' in initialValue ? initialValue.durationSec : null),
    distanceM: previous?.distanceM ?? ('distanceM' in initialValue ? initialValue.distanceM : null),
    addedLoadKg: previous?.addedLoadKg ?? 0,
    restSec: previous?.restSec ?? null,
    band: previous?.band ?? null,
    rpe: previous?.rpe ?? null,
    side: 'both',
    note: previous?.note ?? null,
    completedAt: entryExercise?.endedAt ?? null,
  };
  await db.transaction(async (tx) => {
    if (entryExercise?.unilateral || pairValues) {
      const pairId = id();
      const prior = previous?.pairId ? await tx.select().from(trainingSets).where(eq(trainingSets.pairId, previous.pairId)) : [];
      await tx.insert(trainingSets).values(['left', 'right'].map((side, position) => {
        const source = prior.find((s) => s.side === side);
        return { ...values, ...(source ? { reps: source.reps, durationSec: source.durationSec, distanceM: source.distanceM, addedLoadKg: source.addedLoadKg, rpe: source.rpe, note: source.note } : {}), ...(pairValues ? pairValues[side as 'left' | 'right'] : {}), id: position === 0 ? setId : id(), side, pairId };
      }));
    } else await tx.insert(trainingSets).values(values);
  });
  return setId;
}

export async function updateSet(
  setId: string,
  field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg' | 'restSec',
  value: number,
): Promise<void> {
  await initializeDatabase();
  if (field === 'restSec' && (!Number.isInteger(value) || value < 0 || value > 3600)) {
    throw new RangeError('Rest time must be an integer between 0 and 3600 seconds.');
  }
  if (!Number.isFinite(value) || (field !== 'addedLoadKg' && value < 0) || ((field === 'reps' || field === 'durationSec') && !Number.isInteger(value))) throw new Error('Invalid workout set value');
  if (field === 'reps') {
    await db.update(trainingSets).set({ reps: value }).where(eq(trainingSets.id, setId));
  } else if (field === 'durationSec') {
    await db.update(trainingSets).set({ durationSec: value }).where(eq(trainingSets.id, setId));
  } else if (field === 'distanceM') {
    await db.update(trainingSets).set({ distanceM: value }).where(eq(trainingSets.id, setId));
  } else if (field === 'restSec') {
    await db.update(trainingSets).set({ restSec: value }).where(eq(trainingSets.id, setId));
  } else {
    await db.update(trainingSets).set({ addedLoadKg: value }).where(eq(trainingSets.id, setId));
  }
}

export async function completeSet(setId: string): Promise<void> {
  await initializeDatabase();
  await requireActiveSet(setId);
  await db.update(trainingSets).set({ completedAt: new Date() }).where(eq(trainingSets.id, setId));
}

export async function finishWorkout(workoutId: string): Promise<void> {
  await initializeDatabase();
  const session = await loadSessionExercises(workoutId);
  for (const exercise of session) {
    validatePairs(exercise.sets);
    for (const pair of groupSets(exercise.sets)) {
      if (pair[0].pairId && pair.some((s) => s.completedAt) && !pair.every((s) => s.completedAt)) {
        const missing = pair.find((s) => !s.completedAt)!;
        throw new Error(`${exercise.name} · Serie ${pair[0].index}: ${missing.side === 'left' ? 'Sinistro (L)' : 'Destro (R)'} mancante`);
      }
    }
  }
  await db
    .update(workouts)
    .set({ endedAt: new Date() })
    .where(and(eq(workouts.id, workoutId), isNull(workouts.endedAt)));
}

/**
 * Deletes a workout (in progress or finished) with its exercises, sets and form-check clips. Used
 * both to discard a session that should not count and to remove a logged one from history.
 */
export async function deleteWorkout(workoutId: string): Promise<void> {
  await initializeDatabase();
  const sets = await db.select({ id: trainingSets.id })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .where(eq(exerciseEntries.workoutId, workoutId));
  await deleteFormCheckVideosForSets(sets.map((set) => set.id));
  await db.transaction(async (tx) => {
    const entries = await tx.select({ id: exerciseEntries.id }).from(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId));
    if (entries.length > 0) await tx.delete(trainingSets).where(inArray(trainingSets.entryId, entries.map((entry) => entry.id)));
    await tx.delete(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId));
    await tx.delete(workouts).where(eq(workouts.id, workoutId));
  });
}

export const WORKOUT_NAME_MAX = 60;

/** Renames a finished workout and moves its start and end, keeping it finished. */
export async function updateCompletedWorkoutDetails(
  workoutId: string,
  details: { name: string; startedAt: Date; endedAt: Date },
): Promise<void> {
  const name = details.name.trim();
  if (!name || name.length > WORKOUT_NAME_MAX) throw new RangeError('Workout name must be 1–60 characters');
  const start = details.startedAt.getTime();
  const end = details.endedAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new RangeError('A workout must end after it starts');
  if (start > Date.now()) throw new RangeError('A finished workout cannot start in the future');
  await initializeDatabase();
  await db.update(workouts)
    .set({ name, startedAt: details.startedAt, endedAt: details.endedAt })
    .where(and(eq(workouts.id, workoutId), isNotNull(workouts.endedAt)));
}

/**
 * Creates an empty, already finished workout in the past (a forgotten or untracked session), to be
 * filled in with the history editor.
 */
export async function createPastWorkout(input: { name: string; startedAt: Date; minutes: number }): Promise<string> {
  const name = input.name.trim();
  if (!name || name.length > WORKOUT_NAME_MAX) throw new RangeError('Workout name must be 1–60 characters');
  const start = input.startedAt.getTime();
  if (!Number.isFinite(start) || start > Date.now()) throw new RangeError('A past workout cannot start in the future');
  const minutes = Math.min(600, Math.max(1, Math.round(input.minutes)));
  await initializeDatabase();
  const workoutId = id();
  await db.insert(workouts).values({ id: workoutId, name, startedAt: input.startedAt, endedAt: new Date(start + minutes * 60_000) });
  return workoutId;
}

/**
 * Turns a workout just built from a template into a finished one in the past: it gets its start
 * and end, and every set counts as done at the end. Used to log a program workout after the fact.
 */
export async function convertToPastWorkout(workoutId: string, startedAt: Date, minutes: number): Promise<void> {
  const start = startedAt.getTime();
  if (!Number.isFinite(start) || start > Date.now()) throw new RangeError('A past workout cannot start in the future');
  const endedAt = new Date(start + Math.min(600, Math.max(1, Math.round(minutes))) * 60_000);
  await initializeDatabase();
  await db.transaction(async (tx) => {
    const entries = await tx.select({ id: exerciseEntries.id }).from(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId));
    if (entries.length > 0) {
      const sets = await tx.select().from(trainingSets).where(inArray(trainingSets.entryId, entries.map((entry) => entry.id)));
      validatePairs(sets);
      await tx.update(trainingSets).set({ completedAt: endedAt }).where(inArray(trainingSets.entryId, entries.map((entry) => entry.id)));
    }
    await tx.update(workouts).set({ startedAt, endedAt }).where(eq(workouts.id, workoutId));
  });
}

async function completedWorkoutEnd(workoutId: string): Promise<Date> {
  const [workout] = await db.select({ endedAt: workouts.endedAt }).from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  if (!workout?.endedAt) throw new Error('Workout is not finished');
  return workout.endedAt;
}

/** Adds a set to an exercise of a finished workout, already marked as done. */
export async function addSetToCompletedWorkout(workoutId: string, entryId: string): Promise<string> {
  await initializeDatabase();
  await completedWorkoutEnd(workoutId);
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  if (entry?.workoutId !== workoutId) throw new Error('Exercise does not belong to workout');
  const setId = await addSet(entryId);
  return setId;
}

/** Adds an exercise with one completed set to a finished workout. */
export async function addExerciseToCompletedWorkout(workoutId: string, exerciseId: string): Promise<string> {
  await initializeDatabase();
  const endedAt = await completedWorkoutEnd(workoutId);
  const entryId = await addExerciseToWorkout(workoutId, exerciseId);
  await db.update(trainingSets).set({ completedAt: endedAt }).where(eq(trainingSets.entryId, entryId));
  return entryId;
}

/** Marks a set of a finished workout as done (at the workout's end) or not done. */
export async function setCompletedWorkoutSetDone(workoutId: string, setId: string, done: boolean): Promise<void> {
  await initializeDatabase();
  const endedAt = await completedWorkoutEnd(workoutId);
  await assertSetWorkout(setId, workoutId);
  await db.update(trainingSets).set({ completedAt: done ? endedAt : null }).where(await pairCondition(setId));
}

/** Names of finished workouts, newest first; programs use them to know which session comes next. */
export async function listRecentWorkoutNames(limit = 200): Promise<string[]> {
  await initializeDatabase();
  const rows = await db.select({ name: workouts.name }).from(workouts)
    .where(isNotNull(workouts.endedAt)).orderBy(desc(workouts.startedAt)).limit(limit);
  return rows.map((row) => row.name);
}

export async function listRecentWorkouts(limit = 365): Promise<WorkoutHistoryItem[]> {
  await initializeDatabase();
  const rows = await db
    .select({ id: workouts.id, name: workouts.name, startedAt: workouts.startedAt, endedAt: workouts.endedAt })
    .from(workouts)
    .where(isNotNull(workouts.endedAt))
    .orderBy(desc(workouts.startedAt))
    .limit(limit);

  const setCounts = rows.length === 0 ? [] : await db
    .select({ workoutId: exerciseEntries.workoutId, pairId: trainingSets.pairId, side: trainingSets.side, completedAt: trainingSets.completedAt })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .where(and(inArray(exerciseEntries.workoutId, rows.map((workout) => workout.id)), isNotNull(trainingSets.completedAt)))
    ;
  const setsByWorkout = new Map(rows.map((row) => [row.id, completedSetCount(setCounts.filter((s) => s.workoutId === row.id))]));

  return rows.map((workout) => ({
    ...workout,
    endedAt: workout.endedAt!,
    setCount: setsByWorkout.get(workout.id) ?? 0,
  }));
}

export async function getRecentWeekSummary(): Promise<{ sessions: number; sets: number }> {
  const workoutsThisWeek = (await listRecentWorkouts(100)).filter(
    (workout) => workout.endedAt.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000,
  );
  return {
    sessions: workoutsThisWeek.length,
    sets: workoutsThisWeek.reduce((total, workout) => total + workout.setCount, 0),
  };
}

/** Saves an optional free-text note on a set; blank text clears it. */
export async function updateSetNote(setId: string, note: string): Promise<void> {
  await initializeDatabase();
  const trimmed = note.trim().slice(0, 500);
  await db.update(trainingSets).set({ note: trimmed || null }).where(eq(trainingSets.id, setId));
}

/** Saves an optional free-text note on an exercise within a workout; blank text clears it. */
export async function updateEntryNote(entryId: string, note: string): Promise<void> {
  await initializeDatabase();
  const trimmed = note.trim().slice(0, 1000);
  await db.update(exerciseEntries).set({ notes: trimmed || null }).where(eq(exerciseEntries.id, entryId));
}

/** Switches a set between warm-up and working; its own rest is cleared so the kind's rest applies. */
export async function setSetKind(setId: string, kind: SetKind): Promise<void> {
  await initializeDatabase();
  await db.update(trainingSets).set({ kind, restSec: null }).where(await pairCondition(setId));
}

/** Sets the rest after every not-yet-completed set of one kind in an exercise. */
export async function setEntryRest(entryId: string, kind: SetKind, seconds: number): Promise<void> {
  await initializeDatabase();
  await db.update(trainingSets).set({ restSec: seconds })
    .where(and(eq(trainingSets.entryId, entryId), eq(trainingSets.kind, kind), isNull(trainingSets.completedAt)));
}

/** Saves (or clears, with null) the RPE of a set. */
export async function updateSetRpe(setId: string, rpe: number | null): Promise<void> {
  if (rpe !== null && !isValidRpe(rpe)) throw new RangeError('RPE must be between 6 and 10 in half steps');
  await initializeDatabase();
  await db.update(trainingSets).set({ rpe }).where(eq(trainingSets.id, setId));
}

/** Removes a set with its clips, then renumbers the remaining sets of that exercise from 1. */
export async function removeSet(setId: string): Promise<void> {
  await initializeDatabase();
  const [set] = await db.select({ entryId: trainingSets.entryId }).from(trainingSets).where(eq(trainingSets.id, setId)).limit(1);
  if (!set) return;
  const condition = await pairCondition(setId);
  const removed = await db.select({ id: trainingSets.id }).from(trainingSets).where(condition);
  await deleteFormCheckVideosForSets(removed.map((s) => s.id));
  await db.transaction(async (tx) => {
  await tx.delete(trainingSets).where(condition);
  const remaining = await tx.select().from(trainingSets)
    .where(eq(trainingSets.entryId, set.entryId)).orderBy(asc(trainingSets.index));
  for (const [position, group] of groupSets(remaining).entries()) {
    for (const row of group) await tx.update(trainingSets).set({ index: position + 1 }).where(eq(trainingSets.id, row.id));
  }
  });
}

/** Removes an exercise from a workout together with its sets and their clips. */
export async function removeExerciseEntry(entryId: string): Promise<void> {
  await initializeDatabase();
  const sets = await db.select({ id: trainingSets.id }).from(trainingSets).where(eq(trainingSets.entryId, entryId));
  await deleteFormCheckVideosForSets(sets.map((set) => set.id));
  await db.delete(exerciseEntries).where(eq(exerciseEntries.id, entryId));
}

/** What a removal took away, kept briefly so it can be put back ("Restore" in the undo toast). */
export interface RemovedRows {
  videos?: (typeof formCheckVideos.$inferSelect)[];
  entry: typeof exerciseEntries.$inferSelect | null;
  sets: (typeof trainingSets.$inferSelect)[];
}

/** Removes a whole set group, retaining its clips on disk and their metadata for undo. */
export async function removeSetWithUndo(setId: string): Promise<RemovedRows | null> {
  await initializeDatabase();
  const [row] = await db.select().from(trainingSets).where(eq(trainingSets.id, setId)).limit(1);
  if (!row) return null;
  const sets = await db.select().from(trainingSets).where(await pairCondition(setId));
  const videos = await db.select().from(formCheckVideos).where(inArray(formCheckVideos.setId, sets.map((s) => s.id)));
  await db.transaction(async (tx) => {
    await tx.delete(formCheckVideos).where(inArray(formCheckVideos.setId, sets.map((s) => s.id)));
    await tx.delete(trainingSets).where(inArray(trainingSets.id, sets.map((s) => s.id)));
    const remaining = await tx.select().from(trainingSets).where(eq(trainingSets.entryId, row.entryId)).orderBy(asc(trainingSets.index));
    for (const [position, group] of groupSets(remaining).entries()) for (const s of group) await tx.update(trainingSets).set({ index: position + 1 }).where(eq(trainingSets.id, s.id));
  });
  return { entry: null, sets, videos };
}

/** Removes an exercise with its sets and returns a snapshot that `restoreRemoved` can put back. */
export async function removeExerciseEntryWithUndo(entryId: string): Promise<RemovedRows | null> {
  await initializeDatabase();
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId)).limit(1);
  if (!entry) return null;
  const sets = await db.select().from(trainingSets).where(eq(trainingSets.entryId, entryId)).orderBy(asc(trainingSets.index));
  await removeExerciseEntry(entryId);
  return { entry, sets };
}

/**
 * Puts removed rows back. A single restored set takes its old number again and the sets after it
 * move down one, so the order is what it was before the removal.
 */
export async function restoreRemoved(removed: RemovedRows): Promise<void> {
  await initializeDatabase();
  await db.transaction(async (tx) => {
    if (removed.entry) {
      await tx.insert(exerciseEntries).values(removed.entry);
      if (removed.sets.length > 0) await tx.insert(trainingSets).values(removed.sets);
      if (removed.videos?.length) await tx.insert(formCheckVideos).values(removed.videos);
      return;
    }
    for (const group of groupSets(removed.sets)) {
      const set = group[0];
      const later = await tx.select({ id: trainingSets.id, index: trainingSets.index }).from(trainingSets)
        .where(eq(trainingSets.entryId, set.entryId)).orderBy(desc(trainingSets.index));
      for (const row of later) {
        if (row.index >= set.index) await tx.update(trainingSets).set({ index: row.index + 1 }).where(eq(trainingSets.id, row.id));
      }
      await tx.insert(trainingSets).values(group);
    }
    if (removed.videos?.length) await tx.insert(formCheckVideos).values(removed.videos);
  });
}

export interface PreviousPerformance {
  workoutStartedAt: Date;
  sets: PreviousSetValues[];
}

export type PreviousSetValues = Pick<SessionSet, 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg' | 'rpe' | 'note' | 'side' | 'pairId'>;

/** Fills an open set with the values of a set from last time, note included. */
export async function copyValuesToSet(setId: string, values: PreviousSetValues): Promise<void> {
  await initializeDatabase();
  const { reps, durationSec, distanceM, addedLoadKg, rpe, note } = values;
  await db.update(trainingSets).set({ reps, durationSec, distanceM, addedLoadKg, rpe, note }).where(eq(trainingSets.id, setId));
}

/** Repeats a finished workout unless another one is in progress, whose name is returned instead. */
export async function repeatWorkoutIfIdle(sourceId: string): Promise<{ workoutId: string } | { active: { id: string; name: string } }> {
  const active = await getActiveWorkout();
  if (active) return { active: { id: active.id, name: active.name } };
  return { workoutId: await repeatWorkout(sourceId) };
}

/**
 * Starts a new workout with the same name, exercises and completed sets (kind, values, rest, notes) as
 * a finished one. Exercises without completed sets are left out. Returns the new workout id.
 */
export async function repeatWorkout(sourceId: string): Promise<string> {
  await initializeDatabase();
  const [source] = await db.select({ name: workouts.name }).from(workouts).where(eq(workouts.id, sourceId)).limit(1);
  if (!source) throw new Error('Workout not found');
  const entries = await db.select().from(exerciseEntries).where(eq(exerciseEntries.workoutId, sourceId)).orderBy(asc(exerciseEntries.order));
  const workoutId = await startWorkout(source.name);
  let order = 0;
  for (const entry of entries) {
    const sets = await db.select().from(trainingSets)
      .where(and(eq(trainingSets.entryId, entry.id), isNotNull(trainingSets.completedAt))).orderBy(asc(trainingSets.index));
    if (sets.length === 0) continue;
    order += 1;
    const entryId = id();
    await db.insert(exerciseEntries).values({ id: entryId, workoutId, exerciseId: entry.exerciseId, order, notes: entry.notes, groupId: entry.groupId, groupType: entry.groupType, unilateralRestMode: entry.unilateralRestMode });
    const pairIds = new Map(sets.filter((s) => s.pairId).map((s) => [s.pairId, id()]));
    validatePairs(sets, true);
    await db.insert(trainingSets).values(sets.map((set) => ({
      ...set, id: id(), pairId: set.pairId ? pairIds.get(set.pairId)! : null, entryId, completedAt: null,
    })));
  }
  return workoutId;
}

/** Completed sets from the most recent finished workout that included each exercise. */
export async function getPreviousPerformance(exerciseIds: string[], excludeWorkoutId: string): Promise<Map<string, PreviousPerformance>> {
  await initializeDatabase();
  const result = new Map<string, PreviousPerformance>();
  if (exerciseIds.length === 0) return result;
  const rows = await db
    .select({
      exerciseId: exerciseEntries.exerciseId,
      workoutId: workouts.id,
      startedAt: workouts.startedAt,
      side: trainingSets.side,
      pairId: trainingSets.pairId,
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      distanceM: trainingSets.distanceM,
      addedLoadKg: trainingSets.addedLoadKg,
      rpe: trainingSets.rpe,
      note: trainingSets.note,
    })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(inArray(exerciseEntries.exerciseId, exerciseIds), isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')))
    .orderBy(desc(workouts.startedAt), asc(trainingSets.index));
  const latestWorkout = new Map<string, string>();
  for (const row of rows) {
    if (row.workoutId === excludeWorkoutId) continue;
    const chosen = latestWorkout.get(row.exerciseId);
    if (chosen && chosen !== row.workoutId) continue;
    latestWorkout.set(row.exerciseId, row.workoutId);
    const entry = result.get(row.exerciseId) ?? { workoutStartedAt: row.startedAt, sets: [] };
    entry.sets.push({ side: row.side, pairId: row.pairId, reps: row.reps, durationSec: row.durationSec, distanceM: row.distanceM, addedLoadKg: row.addedLoadKg, rpe: row.rpe, note: row.note });
    result.set(row.exerciseId, entry);
  }
  return result;
}

/** Marks a completed set as not done again, e.g. after tapping complete by mistake. */
export async function uncompleteSet(setId: string): Promise<void> {
  await initializeDatabase();
  await requireActiveSet(setId);
  await db.update(trainingSets).set({ completedAt: null }).where(eq(trainingSets.id, setId));
}

export interface LoggedSetInput {
  pairId?: string | null;
  reps?: number | null;
  durationSec?: number | null;
  side?: 'left' | 'right' | 'both';
  completedAt: Date;
}

/**
 * Records an already-finished session (e.g. a guided mobility routine) in one transaction, with
 * its real start and end times, so it counts toward history, streaks and progress like any workout.
 */
export async function logCompletedWorkout(input: {
  name: string;
  startedAt: Date;
  endedAt: Date;
  entries: { exerciseId: string; sets: LoggedSetInput[] }[];
}): Promise<string> {
  await initializeDatabase();
  if (!Number.isFinite(input.startedAt.getTime()) || !Number.isFinite(input.endedAt.getTime()) || input.endedAt < input.startedAt) throw new Error('Invalid workout times');
  const workoutId = id();
  const entries = input.entries.filter((entry) => entry.sets.length > 0);
  for (const entry of entries) {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.id, entry.exerciseId));
    if (!exercise) throw new Error('Exercise not found');
    entry.sets = entry.sets.flatMap((set) => {
      if (!Number.isFinite(set.completedAt.getTime()) || (set.reps != null && (!Number.isInteger(set.reps) || set.reps < 0)) || (set.durationSec != null && (!Number.isInteger(set.durationSec) || set.durationSec < 0))) throw new Error('Invalid logged set');
      if (set.side && set.side !== 'both' && !set.pairId) throw new Error('Unilateral sets require an explicit pair');
      if (exercise.unilateral && !set.pairId && (!set.side || set.side === 'both')) {
        const pairId = id();
        return [{ ...set, pairId, side: 'left' as const }, { ...set, pairId, side: 'right' as const }];
      }
      return [set];
    });
    validatePairs(entry.sets, true);
  }
  await db.transaction(async (tx) => {
    await tx.insert(workouts).values({ id: workoutId, name: input.name, startedAt: input.startedAt, endedAt: input.endedAt });
    for (const [order, entry] of entries.entries()) {
      const entryId = id();
      const pairIds = new Map(entry.sets.filter((s) => s.pairId).map((s) => [s.pairId!, id()]));
      await tx.insert(exerciseEntries).values({ id: entryId, workoutId, exerciseId: entry.exerciseId, order: order + 1 });
      const indexes = new Map(groupSets(entry.sets).flatMap((group, position) => group.map((set) => [set, position + 1] as const)));
      for (const set of entry.sets) {
        await tx.insert(trainingSets).values({
          id: id(),
          entryId,
          index: indexes.get(set)!,
          reps: set.reps ?? null,
          durationSec: set.durationSec ?? null,
          side: set.side ?? 'both',
          pairId: set.pairId ? pairIds.get(set.pairId)! : null,
          completedAt: set.completedAt,
        });
      }
    }
  });
  return workoutId;
}

/**
 * Swaps the exercise of an entry, keeping its sets, notes and superset. Sets keep their values when the
 * new exercise is measured the same way (reps, hold or distance); otherwise they restart at that
 * measure's default. The load is kept only when the new exercise carries one.
 */
export async function replaceEntryExercise(entryId: string, exerciseId: string): Promise<void> {
  await initializeDatabase();
  const [current] = await db.select({ metric: exercises.metric }).from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id)).where(eq(exerciseEntries.id, entryId)).limit(1);
  const [next] = await db.select({ metric: exercises.metric }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  if (!current || !next) throw new Error('Exercise not found');
  await db.update(exerciseEntries).set({ exerciseId }).where(eq(exerciseEntries.id, entryId));
  if (measureOf(current.metric) !== measureOf(next.metric)) {
    const measure = measureOf(next.metric);
    await db.update(trainingSets).set({
      reps: measure === 'reps' ? 8 : null,
      durationSec: measure === 'time' ? 10 : null,
      distanceM: measure === 'distance' ? 10 : null,
    }).where(eq(trainingSets.entryId, entryId));
  }
  if (!isLoadMetric(next.metric)) await db.update(trainingSets).set({ addedLoadKg: 0 }).where(eq(trainingSets.entryId, entryId));
}

/** Puts an exercise in a superset with the one after it, joining whichever superset either is in. */
export async function linkWithNext(entryId: string): Promise<void> {
  await initializeDatabase();
  const [current] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId)).limit(1);
  if (!current) return;
  const [next] = await db.select().from(exerciseEntries)
    .where(and(eq(exerciseEntries.workoutId, current.workoutId), gt(exerciseEntries.order, current.order)))
    .orderBy(asc(exerciseEntries.order)).limit(1);
  if (!next) return;
  const groupId = current.groupId ?? next.groupId ?? id();
  const groupType = current.groupType ?? next.groupType ?? formatSupersetType({ mode: 'round', betweenSec: 0 });
  const oldGroups = [current.groupId, next.groupId].filter((value): value is string => value !== null);
  await db.update(exerciseEntries).set({ groupId, groupType }).where(or(
    inArray(exerciseEntries.id, [current.id, next.id]),
    oldGroups.length ? and(eq(exerciseEntries.workoutId, current.workoutId), inArray(exerciseEntries.groupId, oldGroups)) : undefined,
  ));
}

/** Takes an exercise out of its superset; a superset left with one exercise is dissolved. */
export async function unlinkEntry(entryId: string): Promise<void> {
  await initializeDatabase();
  const [current] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId)).limit(1);
  if (!current?.groupId) return;
  await db.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, entryId));
  const rest = await db.select({ id: exerciseEntries.id }).from(exerciseEntries)
    .where(and(eq(exerciseEntries.workoutId, current.workoutId), eq(exerciseEntries.groupId, current.groupId)));
  if (rest.length === 1) await db.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, rest[0].id));
}

export async function setSupersetRest(groupId: string, rest: SupersetRest): Promise<void> {
  await initializeDatabase();
  await db.update(exerciseEntries).set({ groupType: formatSupersetType(rest) }).where(eq(exerciseEntries.groupId, groupId));
}

/**
 * Moves an exercise of a workout (in progress or finished) to another position. Positions are
 * rewritten as 1..n. A superset member that ends up away from its group leaves it, and a group left
 * with a single exercise dissolves, so a superset is always made of neighbours.
 */
export async function moveExerciseEntry(workoutId: string, entryId: string, toIndex: number): Promise<void> {
  await initializeDatabase();
  const entries = await db.select().from(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId)).orderBy(asc(exerciseEntries.order));
  const from = entries.findIndex((entry) => entry.id === entryId);
  if (from < 0) return;
  const target = Math.min(entries.length - 1, Math.max(0, toIndex));
  if (target === from) return;
  const reordered = [...entries];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(target, 0, moved);
  await db.transaction(async (tx) => {
    for (const [position, entry] of reordered.entries()) {
      if (entry.order !== position + 1) await tx.update(exerciseEntries).set({ order: position + 1 }).where(eq(exerciseEntries.id, entry.id));
    }
    if (!moved.groupId) return;
    const members = reordered.filter((entry) => entry.groupId === moved.groupId);
    const positions = members.map((entry) => reordered.indexOf(entry));
    const contiguous = positions[positions.length - 1] - positions[0] === members.length - 1;
    if (contiguous) return;
    await tx.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, moved.id));
    const rest = members.filter((entry) => entry.id !== moved.id);
    if (rest.length === 1) await tx.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, rest[0].id));
  });
}
