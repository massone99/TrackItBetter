import { and, count, desc, eq, isNotNull, like, or } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, settings, workouts } from '../../db/schema';
import { getExerciseById, listExercises } from '../exercises/repository';
import { addExerciseToWorkout, completeSet, enableExerciseLoad, finishWorkout, getActiveWorkout, startWorkout, updateSet, updateSetRpe } from './repository';

const LAST_EXERCISE_KEY = 'gtg_last_exercise_id';

/** Name of micro-sessions saved before they were numbered. */
const LEGACY_MICRO_SESSION_NAME = 'Grease the Groove';
const MICRO_SESSION_PREFIX = 'Mini-session';
const isMicroSession = or(eq(workouts.name, LEGACY_MICRO_SESSION_NAME), like(workouts.name, `${MICRO_SESSION_PREFIX} %`));

/** "Mini-session N", N counting every micro-session saved so far plus this one. */
async function nextMicroSessionName(): Promise<string> {
  await initializeDatabase();
  const [row] = await db.select({ value: count() }).from(workouts).where(isMicroSession);
  return `${MICRO_SESSION_PREFIX} ${(row?.value ?? 0) + 1}`;
}

/** Exercise ids from finished micro-sessions, most recent first, without duplicates. */
export async function listRecentMicroSessionExerciseIds(limit = 5): Promise<string[]> {
  await initializeDatabase();
  const rows = await db.select({ exerciseId: exerciseEntries.exerciseId })
    .from(exerciseEntries)
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(isMicroSession, isNotNull(workouts.endedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(100);
  return [...new Set(rows.map((row) => row.exerciseId))].slice(0, limit);
}

/** Resolves ids to exercises in the given order; ids without an exercise (archived) are skipped. */
export function pickRecent<T extends { id: string }>(ids: readonly string[], exercises: readonly T[], limit: number): T[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return [...new Set(ids)].flatMap((id) => byId.get(id) ?? []).slice(0, limit);
}

/** Default practice target for a metric: 10 for timed/distance holds, 3 reps otherwise. */
export function defaultMicroTarget(metric: string): string {
  return metric === 'time' || metric === 'time_load' || metric === 'distance' ? '10' : '3';
}

export async function listMicroSessionExercises(query: string) {
  return listExercises({ query });
}

export async function getLastMicroSessionExercise(): Promise<string | null> {
  await initializeDatabase();
  const value = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, LAST_EXERCISE_KEY)).get();
  return value?.value ?? null;
}

export type MicroSessionItem = { exerciseId: string; value: number; loadKg?: number; rpe?: number | null };

/** Saves a micro-session of one exercise; see logMicroSessionItems. */
export async function logMicroSession(exerciseId: string, value: number, extra: { loadKg?: number; rpe?: number | null } = {}): Promise<void> {
  await logMicroSessionItems([{ exerciseId, value, ...extra }]);
}

/**
 * Saves one finished micro-session with one set per exercise, in the order given: each set's value
 * and, like any workout set, its added load and RPE. A load on a bodyweight-only exercise makes it
 * track load (see enableExerciseLoad). Everything is checked before anything is written.
 */
export async function logMicroSessionItems(items: readonly MicroSessionItem[]): Promise<void> {
  if (items.length === 0) throw new RangeError('Add at least one exercise.');
  for (const item of items) {
    if (!Number.isFinite(item.value) || item.value <= 0 || item.value > 3600) throw new RangeError('Enter a positive practice target.');
    if (!Number.isFinite(item.loadKg ?? 0)) throw new RangeError('Invalid load.');
  }
  if (await getActiveWorkout()) throw new Error('Finish the active workout before logging a micro-session.');
  const found = await Promise.all(items.map((item) => getExerciseById(item.exerciseId)));
  if (found.some((exercise) => !exercise)) throw new Error('Exercise not found.');

  const workoutId = await startWorkout(await nextMicroSessionName());
  for (const [index, item] of items.entries()) {
    const exercise = found[index]!;
    const loadKg = item.loadKg ?? 0;
    if (loadKg !== 0) await enableExerciseLoad(item.exerciseId);
    const entryId = await addExerciseToWorkout(workoutId, item.exerciseId);
    const field = exercise.metric === 'time' || exercise.metric === 'time_load'
      ? 'durationSec'
      : exercise.metric === 'distance' ? 'distanceM' : 'reps';
    const sets = (await getActiveWorkout(workoutId))?.exercises.find((entry) => entry.entryId === entryId)?.sets ?? [];
    for (const set of sets) {
      await updateSet(set.id, field, item.value);
      if (loadKg !== 0 && field !== 'distanceM') await updateSet(set.id, 'addedLoadKg', loadKg);
      if (item.rpe != null) await updateSetRpe(set.id, item.rpe);
      await completeSet(set.id);
    }
  }
  await finishWorkout(workoutId);
  const last = items[items.length - 1].exerciseId;
  await initializeDatabase();
  await db.insert(settings).values({ key: LAST_EXERCISE_KEY, value: last })
    .onConflictDoUpdate({ target: settings.key, set: { value: last } });
}
