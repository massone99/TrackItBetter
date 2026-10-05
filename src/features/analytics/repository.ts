import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { cachedUntilWrite } from '../../db/cache';
import { buildFormSessions, type FormSession } from './formTrend';
import { exerciseEntries, exercises, trainingSets, workouts } from '../../db/schema';
import { buildExerciseCycle, buildExerciseWeek, buildMobilityCycles, buildMobilityWeek, mobilitySecondsForWorkout, type ExerciseCycle, type ExerciseWeek, type MobilityWeek } from './mobility';
import { buildExerciseEstimate, type ExerciseEstimate } from './estimates';
import type { ExploreData } from './explore';
import { buildProgressSnapshot, detectWorkoutRecords, type CompletedSetRow, type CompletedWorkoutRow, type ProgressSnapshot, type WorkoutRecord } from './summary';
import type { StatsSetRow } from './trainingStats';
import { detectSetRecords, detectVolumeRecords, exerciseRecordSummary, type ExerciseRecordSummary, type RecordRow, type SetRecord, type VolumeRecord } from './records';
import { getEffectiveLoad } from './summary';
import { aggregatePairs, groupSets, type PairScope } from '../../domain/setPairs';

/** Scope raw rows once here; the domain builders still accept legacy unscoped rows. */
function rowsForScope<T extends { pairId?: string | null; exerciseId: string }>(rows: readonly T[], scope: PairScope, exerciseId: string): T[] {
  const own = rows.filter((row) => row.exerciseId === exerciseId);
  return aggregatePairs(scope === 'average' && own.some((row) => row.pairId) ? own.filter((row) => row.pairId) : own, scope);
}

/** Load only finalized workouts and sets, then summarize them in the domain layer. */
export async function getProgressSnapshot(now = new Date()): Promise<ProgressSnapshot> {
  const rows = await loadCompletedSetRows();
  const completedWorkouts: CompletedWorkoutRow[] = await db
    .select({ id: workouts.id, startedAt: workouts.startedAt })
    .from(workouts)
    .where(isNotNull(workouts.endedAt))
    .orderBy(desc(workouts.startedAt));

  return buildProgressSnapshot(rows, now, completedWorkouts);
}

/** New personal records set in a finished workout, compared with every earlier workout. */
export async function getWorkoutRecords(workoutId: string): Promise<WorkoutRecord[]> {
  return detectWorkoutRecords(await loadCompletedSetRows(), workoutId);
}

/** Mobility hold time and sessions over the last 7 days. */
export async function getMobilityWeek(now = new Date()): Promise<MobilityWeek> {
  return buildMobilityWeek(await loadCompletedSetRows(), now);
}

/** Seconds of mobility holds in one finished workout. */
export async function getWorkoutMobilitySeconds(workoutId: string): Promise<number> {
  return mobilitySecondsForWorkout(await loadCompletedSetRows(), workoutId);
}

/** Last-7-days sets, sessions and (for holds) time of one exercise. */
export async function getExerciseWeekStats(exerciseId: string, metric: string, now = new Date(), scope: PairScope = 'average'): Promise<ExerciseWeek> {
  return buildExerciseWeek(rowsForScope(await loadCompletedSetRows(), scope, exerciseId), exerciseId, metric, now);
}

/** The exercise's own training week in progress (started the first day it was trained), and the one before. */
export async function getExerciseCycle(exerciseId: string, now = new Date(), scope: PairScope = 'average'): Promise<{ current: ExerciseCycle | null; previous: ExerciseCycle | null }> {
  return buildExerciseCycle(rowsForScope(await loadCompletedSetRows(), scope, exerciseId), exerciseId, now);
}

/** Mobility exercises whose own training week is in progress. */
export async function getMobilityCycles(now = new Date()): Promise<ExerciseCycle[]> {
  return buildMobilityCycles(await loadCompletedSetRows(), now);
}

/** Completed working sets of finished workouts, flat, for the statistics screen. */
export async function getTrainingStatsRows(): Promise<StatsSetRow[]> {
  await initializeDatabase();
  return db.select({
    pairId: trainingSets.pairId,
    side: trainingSets.side,
    workoutId: workouts.id,
    workoutName: workouts.name,
    workoutStartedAt: workouts.startedAt,
    exerciseId: exercises.id,
    exerciseName: exercises.name,
    metric: exercises.metric,
    movementGroup: exercises.movementGroup,
    movementTag: exercises.movementTag,
    movementTags: exercises.movementTags,
    category: exercises.category,
    extraCategories: exercises.extraCategories,
    mobilityMode: exercises.mobilityMode,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    addedLoadKg: trainingSets.addedLoadKg,
    rpe: trainingSets.rpe,
  }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')));
}

/** RPE-based max reps or max hold of one bodyweight exercise. */
export async function getExerciseEstimate(exerciseId: string, now = new Date(), scope: PairScope = 'average'): Promise<ExerciseEstimate | null> {
  return buildExerciseEstimate(rowsForScope(await loadCompletedSetRows(), scope, exerciseId), exerciseId, now);
}

/** Every finished set and workout, for the statistics explorer to slice in memory. */
export async function getExploreData(): Promise<ExploreData> {
  const rows = await loadCompletedSetRows();
  const finished = await db
    .select({
      id: workouts.id,
      name: workouts.name,
      startedAt: workouts.startedAt,
      endedAt: workouts.endedAt,
      sessionRpe: workouts.sessionRpe,
      sleep: workouts.sleep,
      energy: workouts.energy,
      soreness: workouts.soreness,
    })
    .from(workouts)
    .where(isNotNull(workouts.endedAt))
    .orderBy(asc(workouts.startedAt));
  return { rows, workouts: finished };
}

const loadCompletedSetRows = cachedUntilWrite(readCompletedSetRows);

async function readCompletedSetRows(): Promise<CompletedSetRow[]> {
  await initializeDatabase();
  return db
    .select({
      workoutId: workouts.id,
      pairId: trainingSets.pairId,
      side: trainingSets.side,
      workoutStartedAt: workouts.startedAt,
      bodyweightKg: workouts.bodyweightKg,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      category: exercises.category,
      extraCategories: exercises.extraCategories,
      movementPattern: exercises.movementPattern,
      movementGroup: exercises.movementGroup,
      metric: exercises.metric,
      leverageFactor: exercises.leverageFactor,
      setId: trainingSets.id,
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      distanceM: trainingSets.distanceM,
      addedLoadKg: trainingSets.addedLoadKg,
      completedAt: trainingSets.completedAt,
      rpe: trainingSets.rpe,
    })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')))
    .orderBy(asc(trainingSets.completedAt));
}

/**
 * Completed working sets in chronological order, from finished workouts plus `includeWorkoutId`
 * (the one in progress). Rest before a set is the rest set on the previous completed working set of the exercise.
 */
const loadFinishedRecordRows = cachedUntilWrite(() => readRecordRows());

/**
 * Record rows of finished workouts (cached), plus those of the workout in progress when asked. Only
 * the workout in progress is read again; it started after every finished one, so it goes last.
 */
async function loadRecordRows(includeWorkoutId?: string): Promise<RecordRow[]> {
  const finished = await loadFinishedRecordRows();
  if (!includeWorkoutId) return finished;
  const [workout] = await db.select({ endedAt: workouts.endedAt }).from(workouts).where(eq(workouts.id, includeWorkoutId));
  if (!workout || workout.endedAt) return finished;
  return [...finished, ...await readRecordRows(includeWorkoutId)];
}

async function readRecordRows(onlyWorkoutId?: string): Promise<RecordRow[]> {
  await initializeDatabase();
  const workoutFilter = onlyWorkoutId ? eq(workouts.id, onlyWorkoutId) : isNotNull(workouts.endedAt);
  const rows = await db
    .select({
      setId: trainingSets.id,
      pairId: trainingSets.pairId,
      side: trainingSets.side,
      entryId: exerciseEntries.id,
      workoutId: workouts.id,
      bodyweightKg: workouts.bodyweightKg,
      exerciseId: exercises.id,
      metric: exercises.metric,
      leverageFactor: exercises.leverageFactor,
      kind: trainingSets.kind,
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      addedLoadKg: trainingSets.addedLoadKg,
      restSec: trainingSets.restSec,
    })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(workoutFilter, isNotNull(trainingSets.completedAt)))
    .orderBy(asc(workouts.startedAt), asc(exerciseEntries.order), asc(trainingSets.index));
  const result: RecordRow[] = [];
  let previous: (typeof rows)[number] | null = null;
  for (const group of groupSets(rows)) {
    const restBeforePair = previous?.entryId === group[0].entryId && previous.kind === 'working' ? previous.restSec : null;
    for (const row of group) {
    // Rest after a warm-up is not comparable with rest between working sets.
    const restBeforeSec = row.pairId ? restBeforePair : previous?.entryId === row.entryId && previous.kind === 'working' ? previous.restSec : null;
    if (row.kind !== 'working') continue;
    const effectiveLoadKg = getEffectiveLoad({ ...row, distanceM: null, completedAt: null } as never) ?? null;
    result.push({
      pairId: row.pairId, side: row.side,
      setId: row.setId, workoutId: row.workoutId, exerciseId: row.exerciseId, metric: row.metric,
      reps: row.reps, durationSec: row.durationSec, addedLoadKg: row.addedLoadKg, effectiveLoadKg, restBeforeSec,
    });
    }
    previous = group.at(-1) ?? null;
  }
  return result;
}

/** PRs and volume mini PRs of a workout, in progress or finished. */
export async function getSessionRecords(workoutId: string): Promise<{ sets: SetRecord[]; volume: VolumeRecord[] }> {
  const rows = await loadRecordRows(workoutId);
  return { sets: detectSetRecords(rows, workoutId), volume: detectVolumeRecords(rows, workoutId) };
}

export async function getExerciseRecordSummary(exerciseId: string, scope: PairScope = 'average'): Promise<ExerciseRecordSummary> {
  return exerciseRecordSummary(await loadRecordRows(), exerciseId, scope);
}

export interface ExerciseHistorySet {
  pairId?: string | null;
  side?: string;
  pairMembers?: readonly ExerciseHistorySet[];
  id: string;
  kind: string;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  rpe: number | null;
}

export interface ExerciseHistorySession {
  workoutId: string;
  workoutName: string;
  startedAt: Date;
  notes: string | null;
  sets: ExerciseHistorySet[];
}

/** Average form per session of an exercise (rated working sets only), oldest first. */
export async function getExerciseFormHistory(exerciseId: string): Promise<FormSession[]> {
  await initializeDatabase();
  const rows = await db.select({
    workoutId: workouts.id,
    workoutName: workouts.name,
    startedAt: workouts.startedAt,
    pairId: trainingSets.pairId,
    side: trainingSets.side,
    kind: trainingSets.kind,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    distanceM: trainingSets.distanceM,
    completedAt: trainingSets.completedAt,
    formRating: trainingSets.formRating,
  })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(eq(exerciseEntries.exerciseId, exerciseId), isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')))
    .orderBy(asc(workouts.startedAt), asc(trainingSets.index));
  return buildFormSessions(rows);
}

/** Every finished session that included an exercise, newest first, with its completed sets in order. */
export async function getExerciseHistory(exerciseId: string, limit?: number): Promise<ExerciseHistorySession[]> {
  await initializeDatabase();
  const rows = await db.select({
    entryId: exerciseEntries.id,
    notes: exerciseEntries.notes,
    workoutId: workouts.id,
    workoutName: workouts.name,
    startedAt: workouts.startedAt,
    setId: trainingSets.id,
    pairId: trainingSets.pairId,
    side: trainingSets.side,
    index: trainingSets.index,
    kind: trainingSets.kind,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    distanceM: trainingSets.distanceM,
    addedLoadKg: trainingSets.addedLoadKg,
    rpe: trainingSets.rpe,
  }).from(exerciseEntries)
    .innerJoin(workouts, eq(workouts.id, exerciseEntries.workoutId))
    .innerJoin(trainingSets, eq(trainingSets.entryId, exerciseEntries.id))
    .where(and(eq(exerciseEntries.exerciseId, exerciseId), isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt)))
    .orderBy(desc(workouts.startedAt), asc(exerciseEntries.order), asc(trainingSets.index));
  const sessions = new Map<string, ExerciseHistorySession>();
  for (const row of rows) {
    let session = sessions.get(row.workoutId);
    if (!session) {
      if (limit !== undefined && sessions.size >= limit) break;
      session = { workoutId: row.workoutId, workoutName: row.workoutName, startedAt: row.startedAt, notes: row.notes, sets: [] };
      sessions.set(row.workoutId, session);
    }
    session.sets.push({ id: row.setId, pairId: row.pairId, side: row.side, kind: row.kind, reps: row.reps, durationSec: row.durationSec, distanceM: row.distanceM, addedLoadKg: row.addedLoadKg, rpe: row.rpe });
  }
  return [...sessions.values()];
}
