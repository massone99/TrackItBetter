import { and, count, desc, eq, isNotNull, like, or } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { groupSets } from '../../domain/setPairs';
import { exerciseEntries, settings, workouts } from '../../db/schema';
import { getExerciseById, listExercises } from '../exercises/repository';
import { addExerciseToWorkout, addSet, completeSet, enableExerciseLoad, finishWorkout, getActiveWorkout, removeSet, setSetFormRating, setSetKind, startWorkout, updateSet, updateSetRpe } from './repository';

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

export type MicroSet = { kind?: 'working' | 'warmup'; value: number; loadKg?: number; rpe?: number | null; formRating?: number | null };
export type MicroSessionItem = { exerciseId: string; sets: MicroSet[] };

/** Saves a micro-session of one set of one exercise; see logMicroSessionItems. */
export async function logMicroSession(exerciseId: string, value: number, extra: { loadKg?: number; rpe?: number | null } = {}): Promise<void> {
  await logMicroSessionItems([{ exerciseId, sets: [{ value, ...extra }] }]);
}

/**
 * Saves one finished micro-session: per exercise, in the order given, its sets with their value and,
 * like any workout set, kind, added load, RPE and form. A load on a bodyweight-only exercise makes it
 * track load (see enableExerciseLoad). Everything is checked before anything is written.
 */
export async function logMicroSessionItems(items: readonly MicroSessionItem[]): Promise<void> {
  if (items.length === 0 || items.some((item) => item.sets.length === 0)) throw new RangeError('Add at least one set.');
  for (const set of items.flatMap((item) => item.sets)) {
    if (!Number.isFinite(set.value) || set.value <= 0 || set.value > 3600) throw new RangeError('Enter a positive practice target.');
    if (!Number.isFinite(set.loadKg ?? 0)) throw new RangeError('Invalid load.');
  }
  if (await getActiveWorkout()) throw new Error('Finish the active workout before logging a micro-session.');
  const found = await Promise.all(items.map((item) => getExerciseById(item.exerciseId)));
  if (found.some((exercise) => !exercise)) throw new Error('Exercise not found.');

  const workoutId = await startWorkout(await nextMicroSessionName());
  for (const [index, item] of items.entries()) {
    const exercise = found[index]!;
    if (item.sets.some((set) => (set.loadKg ?? 0) !== 0)) await enableExerciseLoad(item.exerciseId);
    const entryId = await addExerciseToWorkout(workoutId, item.exerciseId);
    const field = exercise.metric === 'time' || exercise.metric === 'time_load'
      ? 'durationSec'
      : exercise.metric === 'distance' ? 'distanceM' : 'reps';
    // The entry starts with its default sets: add or drop sets to match, then fill them in order. A
    // one-sided exercise has an L/R pair per set, both sides getting the same values.
    const groupsOf = async () => groupSets((await getActiveWorkout(workoutId))?.exercises.find((entry) => entry.entryId === entryId)?.sets ?? []);
    let groups = await groupsOf();
    for (let missing = item.sets.length - groups.length; missing > 0; missing -= 1) await addSet(entryId);
    for (const extra of groups.slice(item.sets.length)) await removeSet(extra[0].id);
    groups = await groupsOf();
    for (const [setIndex, values] of item.sets.entries()) {
      for (const set of groups[setIndex] ?? []) {
        await setSetKind(set.id, values.kind ?? 'working');
        await updateSet(set.id, field, values.value);
        if ((values.loadKg ?? 0) !== 0 && field !== 'distanceM') await updateSet(set.id, 'addedLoadKg', values.loadKg!);
        if (values.rpe != null) await updateSetRpe(set.id, values.rpe);
        if (values.formRating != null && values.kind !== 'warmup') await setSetFormRating(set.id, values.formRating);
        await completeSet(set.id);
      }
    }
  }
  await finishWorkout(workoutId);
  const last = items[items.length - 1].exerciseId;
  await initializeDatabase();
  await db.insert(settings).values({ key: LAST_EXERCISE_KEY, value: last })
    .onConflictDoUpdate({ target: settings.key, set: { value: last } });
}
