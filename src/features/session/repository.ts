import { and, asc, count, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { bodyMeasurements, exerciseEntries, exercises, formCheckVideos, trainingSets, workouts } from '../../db/schema';
import { deleteFormCheckVideosForSets } from '../media/formVideos';
import { isValidRpe } from '../../domain/rpe';

export interface SessionSet {
  id: string;
  index: number;
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
  entryId: string;
  exerciseId: string;
  name: string;
  metric: string;
  /** Link to a reference video showing good form, if one was attached to the exercise. */
  demoUrl: string | null;
  /** Free-text note for this exercise within the workout. */
  notes: string | null;
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
      demoUrl: exercise.demoUrl,
      notes: entry.notes,
      sets: sets.map((set) => ({
        id: set.id,
        index: set.index,
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

export async function addSet(entryId: string): Promise<string> {
  await initializeDatabase();
  const [entryExercise] = await db
    .select({ metric: exercises.metric })
    .from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
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
  await db.insert(trainingSets).values({
    id: setId,
    entryId,
    index: (previous?.index ?? 0) + 1,
    reps: previous?.reps ?? ('reps' in initialValue ? initialValue.reps : null),
    durationSec: previous?.durationSec ?? ('durationSec' in initialValue ? initialValue.durationSec : null),
    distanceM: previous?.distanceM ?? ('distanceM' in initialValue ? initialValue.distanceM : null),
    addedLoadKg: previous?.addedLoadKg ?? 0,
    restSec: previous?.restSec ?? null,
    band: previous?.band ?? null,
    rpe: previous?.rpe ?? null,
    side: previous?.side ?? 'both',
    note: previous?.note ?? null,
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
  await db.update(trainingSets).set({ completedAt: new Date() }).where(eq(trainingSets.id, setId));
}

export async function finishWorkout(workoutId: string): Promise<void> {
  await initializeDatabase();
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

async function completedWorkoutEnd(workoutId: string): Promise<Date> {
  const [workout] = await db.select({ endedAt: workouts.endedAt }).from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  if (!workout?.endedAt) throw new Error('Workout is not finished');
  return workout.endedAt;
}

/** Adds a set to an exercise of a finished workout, already marked as done. */
export async function addSetToCompletedWorkout(workoutId: string, entryId: string): Promise<string> {
  await initializeDatabase();
  const endedAt = await completedWorkoutEnd(workoutId);
  const setId = await addSet(entryId);
  await db.update(trainingSets).set({ completedAt: endedAt }).where(eq(trainingSets.id, setId));
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
  await db.update(trainingSets).set({ completedAt: done ? endedAt : null }).where(eq(trainingSets.id, setId));
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
    .select({ workoutId: exerciseEntries.workoutId, value: count(trainingSets.id) })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .where(and(inArray(exerciseEntries.workoutId, rows.map((workout) => workout.id)), isNotNull(trainingSets.completedAt)))
    .groupBy(exerciseEntries.workoutId);
  const setsByWorkout = new Map(setCounts.map((row) => [row.workoutId, row.value]));

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
  await deleteFormCheckVideosForSets([setId]);
  await db.delete(trainingSets).where(eq(trainingSets.id, setId));
  const remaining = await db.select({ id: trainingSets.id }).from(trainingSets)
    .where(eq(trainingSets.entryId, set.entryId)).orderBy(asc(trainingSets.index));
  for (const [position, row] of remaining.entries()) {
    await db.update(trainingSets).set({ index: position + 1 }).where(eq(trainingSets.id, row.id));
  }
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
  entry: typeof exerciseEntries.$inferSelect | null;
  sets: (typeof trainingSets.$inferSelect)[];
}

/** Removes a set and returns a snapshot that `restoreRemoved` can put back (clips are not kept). */
export async function removeSetWithUndo(setId: string): Promise<RemovedRows | null> {
  await initializeDatabase();
  const [row] = await db.select().from(trainingSets).where(eq(trainingSets.id, setId)).limit(1);
  if (!row) return null;
  await removeSet(setId);
  return { entry: null, sets: [row] };
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
      return;
    }
    for (const set of removed.sets) {
      const later = await tx.select({ id: trainingSets.id, index: trainingSets.index }).from(trainingSets)
        .where(eq(trainingSets.entryId, set.entryId)).orderBy(desc(trainingSets.index));
      for (const row of later) {
        if (row.index >= set.index) await tx.update(trainingSets).set({ index: row.index + 1 }).where(eq(trainingSets.id, row.id));
      }
      await tx.insert(trainingSets).values(set);
    }
  });
}

export interface PreviousPerformance {
  workoutStartedAt: Date;
  sets: Pick<SessionSet, 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg' | 'rpe'>[];
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
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      distanceM: trainingSets.distanceM,
      addedLoadKg: trainingSets.addedLoadKg,
      rpe: trainingSets.rpe,
    })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(inArray(exerciseEntries.exerciseId, exerciseIds), isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt)))
    .orderBy(desc(workouts.startedAt), asc(trainingSets.index));
  const latestWorkout = new Map<string, string>();
  for (const row of rows) {
    if (row.workoutId === excludeWorkoutId) continue;
    const chosen = latestWorkout.get(row.exerciseId);
    if (chosen && chosen !== row.workoutId) continue;
    latestWorkout.set(row.exerciseId, row.workoutId);
    const entry = result.get(row.exerciseId) ?? { workoutStartedAt: row.startedAt, sets: [] };
    entry.sets.push({ reps: row.reps, durationSec: row.durationSec, distanceM: row.distanceM, addedLoadKg: row.addedLoadKg, rpe: row.rpe });
    result.set(row.exerciseId, entry);
  }
  return result;
}

/** Marks a completed set as not done again, e.g. after tapping complete by mistake. */
export async function uncompleteSet(setId: string): Promise<void> {
  await initializeDatabase();
  await db.update(trainingSets).set({ completedAt: null }).where(eq(trainingSets.id, setId));
}

export interface LoggedSetInput {
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
  const workoutId = id();
  const entries = input.entries.filter((entry) => entry.sets.length > 0);
  await db.transaction(async (tx) => {
    await tx.insert(workouts).values({ id: workoutId, name: input.name, startedAt: input.startedAt, endedAt: input.endedAt });
    for (const [order, entry] of entries.entries()) {
      const entryId = id();
      await tx.insert(exerciseEntries).values({ id: entryId, workoutId, exerciseId: entry.exerciseId, order: order + 1 });
      for (const [position, set] of entry.sets.entries()) {
        await tx.insert(trainingSets).values({
          id: id(),
          entryId,
          index: position + 1,
          reps: set.reps ?? null,
          durationSec: set.durationSec ?? null,
          side: set.side ?? 'both',
          completedAt: set.completedAt,
        });
      }
    }
  });
  return workoutId;
}
