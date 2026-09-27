import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, trainingSets, workouts } from '../../db/schema';
import { buildProgressSnapshot, detectWorkoutRecords, type CompletedSetRow, type CompletedWorkoutRow, type ProgressSnapshot, type WorkoutRecord } from './summary';

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
