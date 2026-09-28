import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, settings, workouts } from '../../db/schema';
import { getExerciseById, listExercises } from '../exercises/repository';
import { addExerciseToWorkout, completeSet, finishWorkout, getActiveWorkout, startWorkout, updateSet } from './repository';

const LAST_EXERCISE_KEY = 'gtg_last_exercise_id';

export const MICRO_SESSION_NAME = 'Grease the Groove';

/** Exercise ids from finished micro-sessions, most recent first, without duplicates. */
export async function listRecentMicroSessionExerciseIds(limit = 5): Promise<string[]> {
  await initializeDatabase();
  const rows = await db.select({ exerciseId: exerciseEntries.exerciseId })
    .from(exerciseEntries)
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(eq(workouts.name, MICRO_SESSION_NAME), isNotNull(workouts.endedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(100);
  return [...new Set(rows.map((row) => row.exerciseId))].slice(0, limit);
}

/** Resolves ids to exercises in the given order; ids without an exercise (archived) are skipped. */
export function pickRecent<T extends { id: string }>(ids: readonly string[], exercises: readonly T[], limit: number): T[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return [...new Set(ids)].flatMap((id) => byId.get(id) ?? []).slice(0, limit);
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

  const workoutId = await startWorkout(MICRO_SESSION_NAME);
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
