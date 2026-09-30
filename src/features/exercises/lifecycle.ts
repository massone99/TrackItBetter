import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, formCheckVideos, settings, trainingSets, workouts } from '../../db/schema';
import { isLoadMetric, measureOf } from '../../domain/userProgram';
import { deleteFormCheckVideosForSets } from '../media/formVideos';
import { readPreference, writePreference } from '../../shared/settings/preferences';
import { readTrendChoice, writeTrendChoice } from '../analytics/trendChoice';

/** Settings rows holding exercise ids inside JSON: user programs and mobility routines. */
const PROGRAMS_KEY = 'user_weekly_programs_v1';
const ROUTINES_KEY = 'mobility_routines_v1';
const GTG_KEY = 'gtg_last_exercise_id';
const REST_KINDS = ['working', 'warmup'] as const;
const restKey = (exerciseId: string, kind: string) => `rest.exercise.${exerciseId}.${kind}`;

export interface ExerciseUsage {
  workouts: number;
  sets: number;
  /** Whether any logged set carries added (or assisted) load. */
  hasLoad: boolean;
}

/** How much logged history an exercise has, for confirmations. */
export async function getExerciseUsage(exerciseId: string): Promise<ExerciseUsage> {
  await initializeDatabase();
  const entries = await db.select({ id: exerciseEntries.id, workoutId: exerciseEntries.workoutId }).from(exerciseEntries)
    .innerJoin(workouts, eq(workouts.id, exerciseEntries.workoutId))
    .where(and(eq(exerciseEntries.exerciseId, exerciseId), isNotNull(workouts.endedAt)));
  if (entries.length === 0) return { workouts: 0, sets: 0, hasLoad: false };
  const sets = await db.select({ load: trainingSets.addedLoadKg }).from(trainingSets)
    .where(and(inArray(trainingSets.entryId, entries.map((entry) => entry.id)), isNotNull(trainingSets.completedAt)));
  return { workouts: new Set(entries.map((entry) => entry.workoutId)).size, sets: sets.length, hasLoad: sets.some((set) => set.load !== 0) };
}

/** Hides an exercise (catalog or custom) from the library and pickers; its history stays. */
export async function hideExercise(exerciseId: string): Promise<void> {
  await initializeDatabase();
  await db.update(exercises).set({ archived: true }).where(eq(exercises.id, exerciseId));
}

/** Two exercises can share history when they are measured the same way (reps, time or distance). */
export function canTransfer(fromMetric: string, toMetric: string): boolean {
  return measureOf(fromMetric) === measureOf(toMetric);
}

/** The metric the destination needs so no logged load is hidden after a transfer. */
export function metricAfterTransfer<M extends string>(toMetric: M, sourceHasLoad: boolean): M | 'reps_load' | 'time_load' {
  if (!sourceHasLoad || isLoadMetric(toMetric)) return toMetric;
  return toMetric === 'time' ? 'time_load' : toMetric === 'reps' ? 'reps_load' : toMetric;
}

/**
 * Moves every logged set, clip and reference of one exercise to another, in one transaction:
 * workouts, form-check clips, programs, mobility routines, the last grease-the-groove choice,
 * per-exercise rest and the chosen progress trends. The destination switches to a load metric
 * when the source carried load. With `deleteSource` the emptied source exercise is removed.
 */
export async function transferExerciseHistory(fromId: string, toId: string, options: { deleteSource: boolean }): Promise<void> {
  if (fromId === toId) return;
  await initializeDatabase();
  const [from] = await db.select().from(exercises).where(eq(exercises.id, fromId)).limit(1);
  const [to] = await db.select().from(exercises).where(eq(exercises.id, toId)).limit(1);
  if (!from || !to) throw new Error('Exercise not found');
  if (!canTransfer(from.metric, to.metric)) throw new RangeError('These exercises are measured differently');
  const usage = await getExerciseUsage(fromId);
  const metric = metricAfterTransfer(to.metric, usage.hasLoad || isLoadMetric(from.metric));

  await db.transaction(async (tx) => {
    if (metric !== to.metric) await tx.update(exercises).set({ metric }).where(eq(exercises.id, toId));
    await tx.update(exerciseEntries).set({ exerciseId: toId }).where(eq(exerciseEntries.exerciseId, fromId));
    await tx.update(formCheckVideos).set({ exerciseId: toId }).where(eq(formCheckVideos.exerciseId, fromId));
    await rewriteSettingsJson(tx, (id) => (id === fromId ? toId : id));
    if (options.deleteSource) await tx.delete(exercises).where(eq(exercises.id, fromId));
  });
  moveLocalPreferences(fromId, toId);
}

/**
 * Deletes an exercise together with every set logged for it and their clips. Workouts left with
 * no exercise are removed as well; programs and routines drop the movement.
 */
export async function deleteExerciseWithHistory(exerciseId: string): Promise<void> {
  await initializeDatabase();
  const entries = await db.select({ id: exerciseEntries.id, workoutId: exerciseEntries.workoutId }).from(exerciseEntries)
    .where(eq(exerciseEntries.exerciseId, exerciseId));
  const entryIds = entries.map((entry) => entry.id);
  const setIds = entryIds.length
    ? (await db.select({ id: trainingSets.id }).from(trainingSets).where(inArray(trainingSets.entryId, entryIds))).map((set) => set.id)
    : [];
  await deleteFormCheckVideosForSets(setIds);
  await db.transaction(async (tx) => {
    await tx.delete(formCheckVideos).where(eq(formCheckVideos.exerciseId, exerciseId));
    if (entryIds.length) {
      await tx.delete(trainingSets).where(inArray(trainingSets.entryId, entryIds));
      await tx.delete(exerciseEntries).where(inArray(exerciseEntries.id, entryIds));
    }
    const touched = [...new Set(entries.map((entry) => entry.workoutId))];
    if (touched.length) {
      const stillUsed = new Set((await tx.select({ workoutId: exerciseEntries.workoutId }).from(exerciseEntries)
        .where(inArray(exerciseEntries.workoutId, touched))).map((row) => row.workoutId));
      const empty = touched.filter((id) => !stillUsed.has(id));
      if (empty.length) await tx.delete(workouts).where(and(inArray(workouts.id, empty), isNotNull(workouts.endedAt)));
    }
    await rewriteSettingsJson(tx, (id) => (id === exerciseId ? null : id));
    await tx.delete(exercises).where(eq(exercises.id, exerciseId));
  });
  moveLocalPreferences(exerciseId, null);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Rewrites exercise ids inside the JSON settings; a null result drops the movement. */
async function rewriteSettingsJson(tx: Tx, map: (id: string) => string | null): Promise<void> {
  const rows = await tx.select().from(settings).where(inArray(settings.key, [PROGRAMS_KEY, ROUTINES_KEY, GTG_KEY]));
  for (const row of rows) {
    let next: string | null = row.value;
    if (row.key === GTG_KEY) {
      next = map(row.value);
    } else {
      try {
        const parsed: unknown = JSON.parse(row.value);
        if (!Array.isArray(parsed)) continue;
        const listKey = row.key === PROGRAMS_KEY ? 'sessions' : null;
        const rewriteItems = (items: unknown[]) => items.flatMap((item) => {
          if (!item || typeof item !== 'object' || typeof (item as { exerciseId?: unknown }).exerciseId !== 'string') return [item];
          const id = map((item as { exerciseId: string }).exerciseId);
          return id === null ? [] : [{ ...(item as object), exerciseId: id }];
        });
        const rewritten = parsed.map((entry) => {
          if (!entry || typeof entry !== 'object') return entry;
          if (listKey) {
            const sessions = (entry as { sessions?: unknown }).sessions;
            if (!Array.isArray(sessions)) return entry;
            return { ...entry, sessions: sessions.map((session) => {
              const list = session && typeof session === 'object' ? (session as { exercises?: unknown }).exercises : null;
              return Array.isArray(list) ? { ...session, exercises: rewriteItems(list) } : session;
            }) };
          }
          const steps = (entry as { steps?: unknown }).steps;
          return Array.isArray(steps) ? { ...entry, steps: rewriteItems(steps) } : entry;
        });
        next = JSON.stringify(rewritten);
      } catch {
        continue;
      }
    }
    if (next === row.value) continue;
    if (next === null) await tx.delete(settings).where(eq(settings.key, row.key));
    else await tx.update(settings).set({ value: next }).where(and(eq(settings.key, row.key), ne(settings.value, next)));
  }
}

/** Per-exercise rest and the chosen progress trends live in local preferences. */
function moveLocalPreferences(fromId: string, toId: string | null): void {
  if (toId) {
    for (const kind of REST_KINDS) {
      const value = readPreference(restKey(fromId, kind));
      if (value !== null && readPreference(restKey(toId, kind)) === null) writePreference(restKey(toId, kind), value);
    }
  }
  const choice = readTrendChoice();
  if (choice.exerciseIds) {
    const ids = choice.exerciseIds.flatMap((id) => (id === fromId ? (toId ? [toId] : []) : [id]));
    writeTrendChoice({ ...choice, exerciseIds: [...new Set(ids)] });
  }
}
