import { and, asc, desc, eq, isNotNull, or } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, trainingSets, workouts } from '../../db/schema';
import { buildExerciseCycle, buildExerciseWeek, buildMobilityCycles, buildMobilityWeek, mobilitySecondsForWorkout, type ExerciseCycle, type ExerciseWeek, type MobilityWeek } from './mobility';
import { buildExerciseEstimate, type ExerciseEstimate } from './estimates';
import type { ExploreData } from './explore';
import { buildProgressSnapshot, detectWorkoutRecords, type CompletedSetRow, type CompletedWorkoutRow, type ProgressSnapshot, type WorkoutRecord } from './summary';
import type { StatsSetRow } from './trainingStats';
import { detectSetRecords, detectVolumeRecords, exerciseRecordSummary, type ExerciseRecordSummary, type RecordRow, type SetRecord, type VolumeRecord } from './records';
import { getEffectiveLoad } from './summary';

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
export async function getExerciseWeekStats(exerciseId: string, metric: string, now = new Date()): Promise<ExerciseWeek> {
  return buildExerciseWeek(await loadCompletedSetRows(), exerciseId, metric, now);
}

/** The exercise's own training week in progress (started the first day it was trained), and the one before. */
export async function getExerciseCycle(exerciseId: string, now = new Date()): Promise<{ current: ExerciseCycle | null; previous: ExerciseCycle | null }> {
  return buildExerciseCycle(await loadCompletedSetRows(), exerciseId, now);
}

/** Mobility exercises whose own training week is in progress. */
export async function getMobilityCycles(now = new Date()): Promise<ExerciseCycle[]> {
  return buildMobilityCycles(await loadCompletedSetRows(), now);
}

/** Completed working sets of finished workouts, flat, for the statistics screen. */
export async function getTrainingStatsRows(): Promise<StatsSetRow[]> {
  await initializeDatabase();
  return db.select({
    workoutId: workouts.id,
    workoutName: workouts.name,
    workoutStartedAt: workouts.startedAt,
    exerciseId: exercises.id,
    exerciseName: exercises.name,
    metric: exercises.metric,
    movementGroup: exercises.movementGroup,
    movementTag: exercises.movementTag,
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
export async function getExerciseEstimate(exerciseId: string, now = new Date()): Promise<ExerciseEstimate | null> {
  return buildExerciseEstimate(await loadCompletedSetRows(), exerciseId, now);
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

async function loadCompletedSetRows(): Promise<CompletedSetRow[]> {
  await initializeDatabase();
  return db
    .select({
      workoutId: workouts.id,
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
async function loadRecordRows(includeWorkoutId?: string): Promise<RecordRow[]> {
  await initializeDatabase();
  const workoutFilter = includeWorkoutId ? or(isNotNull(workouts.endedAt), eq(workouts.id, includeWorkoutId)) : isNotNull(workouts.endedAt);
  const rows = await db
    .select({
      setId: trainingSets.id,
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
  for (const row of rows) {
    // Rest after a warm-up is not comparable with rest between working sets.
    const restBeforeSec = previous?.entryId === row.entryId && previous.kind === 'working' ? previous.restSec : null;
    previous = row;
    if (row.kind !== 'working') continue;
    const effectiveLoadKg = getEffectiveLoad({ ...row, distanceM: null, completedAt: null } as never) ?? null;
    result.push({
      setId: row.setId, workoutId: row.workoutId, exerciseId: row.exerciseId, metric: row.metric,
      reps: row.reps, durationSec: row.durationSec, addedLoadKg: row.addedLoadKg, effectiveLoadKg, restBeforeSec,
    });
  }
  return result;
}

/** PRs and volume mini PRs of a workout, in progress or finished. */
export async function getSessionRecords(workoutId: string): Promise<{ sets: SetRecord[]; volume: VolumeRecord[] }> {
  const rows = await loadRecordRows(workoutId);
  return { sets: detectSetRecords(rows, workoutId), volume: detectVolumeRecords(rows, workoutId) };
}

export async function getExerciseRecordSummary(exerciseId: string): Promise<ExerciseRecordSummary> {
  return exerciseRecordSummary(await loadRecordRows(), exerciseId);
}

export interface ExerciseHistorySet {
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
    session.sets.push({ id: row.setId, kind: row.kind, reps: row.reps, durationSec: row.durationSec, distanceM: row.distanceM, addedLoadKg: row.addedLoadKg, rpe: row.rpe });
  }
  return [...sessions.values()];
}
