import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, trainingSets, workouts } from '../../db/schema';
import { buildExerciseCycle, buildExerciseWeek, buildMobilityCycles, buildMobilityWeek, mobilitySecondsForWorkout, type ExerciseCycle, type ExerciseWeek, type MobilityWeek } from './mobility';
import { buildProgressSnapshot, detectWorkoutRecords, type CompletedSetRow, type CompletedWorkoutRow, type ProgressSnapshot, type WorkoutRecord } from './summary';
import type { StatsSetRow } from './trainingStats';

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
      metric: exercises.metric,
      leverageFactor: exercises.leverageFactor,
      setId: trainingSets.id,
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      distanceM: trainingSets.distanceM,
      addedLoadKg: trainingSets.addedLoadKg,
      completedAt: trainingSets.completedAt,
    })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')))
    .orderBy(asc(trainingSets.completedAt));
}
