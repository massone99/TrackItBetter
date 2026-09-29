import { and, count, desc, eq, isNotNull, like, or } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, settings, workouts } from '../../db/schema';
import { getExerciseById, listExercises } from '../exercises/repository';
import { addExerciseToWorkout, completeSet, finishWorkout, getActiveWorkout, startWorkout, updateSet } from './repository';

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

export async function logMicroSession(exerciseId: string, value: number): Promise<void> {
  if (!Number.isFinite(value) || value <= 0 || value > 3600) throw new RangeError('Enter a positive practice target.');
  if (await getActiveWorkout()) throw new Error('Finish the active workout before logging a micro-session.');
  const exercise = await getExerciseById(exerciseId);
  if (!exercise) throw new Error('Exercise not found.');

  const workoutId = await startWorkout(await nextMicroSessionName());
  try {
    const entryId = await addExerciseToWorkout(workoutId, exerciseId);
    const setId = await (async () => {
      const active = await getActiveWorkout(workoutId);
      const set = active?.exercises.find((item) => item.entryId === entryId)?.sets[0];
      if (!set) throw new Error('Could not create the micro-session set.');
      return set.id;
    })();
    const field = exercise.metric === 'time' || exercise.metric === 'time_load'
      ? 'durationSec'
      : exercise.metric === 'distance' ? 'distanceM' : 'reps';
    await updateSet(setId, field, value);
    await completeSet(setId);
    await finishWorkout(workoutId);
    await initializeDatabase();
    await db.insert(settings).values({ key: LAST_EXERCISE_KEY, value: exerciseId })
      .onConflictDoUpdate({ target: settings.key, set: { value: exerciseId } });
  } catch (error) {
    await finishWorkout(workoutId);
    throw error;
  }
}
