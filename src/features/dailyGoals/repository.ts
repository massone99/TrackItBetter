import { and, eq, gte, ne } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, settings, trainingSets, workouts } from '../../db/schema';
import { dailyGoalProgress, isValidDailyGoal, MAX_DAILY_GOALS, parseDailyGoals, startOfToday, type DailyGoal, type DailyGoalProgress, type DaySet } from '../../domain/dailyGoals';
import { rowCategories } from '../analytics/summary';
import { exerciseMovementTags } from '../exercises/movementCatalog';

const KEY = 'daily_goals';

export async function listDailyGoals(): Promise<DailyGoal[]> {
  await initializeDatabase();
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).get();
  return parseDailyGoals(row?.value);
}

async function saveDailyGoals(goals: readonly DailyGoal[]): Promise<void> {
  if (goals.length > MAX_DAILY_GOALS || !goals.every(isValidDailyGoal)) throw new RangeError('Invalid daily goals');
  const value = JSON.stringify(goals);
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Adds a goal, or updates the one with the same id. */
export async function putDailyGoal(goal: Omit<DailyGoal, 'id'> & { id?: string }): Promise<DailyGoal> {
  const goals = await listDailyGoals();
  const saved: DailyGoal = { ...goal, id: goal.id ?? Crypto.randomUUID() };
  const index = goals.findIndex((item) => item.id === saved.id);
  await saveDailyGoals(index >= 0 ? goals.map((item, i) => (i === index ? saved : item)) : [...goals, saved]);
  return saved;
}

export async function removeDailyGoal(id: string): Promise<void> {
  const goals = await listDailyGoals();
  await saveDailyGoals(goals.filter((goal) => goal.id !== id));
}

/** Working sets completed since midnight, in any workout (finished or still going). */
export async function listTodaySets(now = new Date()): Promise<DaySet[]> {
  await initializeDatabase();
  const rows = await db.select({
    workoutId: workouts.id,
    workoutName: workouts.name,
    exerciseId: exercises.id,
    exerciseName: exercises.name,
    completedAt: trainingSets.completedAt,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    category: exercises.category,
    extraCategories: exercises.extraCategories,
    movementGroup: exercises.movementGroup,
    movementTag: exercises.movementTag,
    movementTags: exercises.movementTags,
  })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .where(and(gte(trainingSets.completedAt, startOfToday(now)), ne(trainingSets.kind, 'warmup')));
  return rows.map((row) => ({
    workoutId: row.workoutId,
    workoutName: row.workoutName,
    exerciseId: row.exerciseId,
    exerciseName: row.exerciseName,
    completedAt: row.completedAt!,
    reps: row.reps,
    durationSec: row.durationSec,
    categories: rowCategories(row),
    group: row.movementGroup,
    tags: exerciseMovementTags(row),
  }));
}

export type DailyGoalsSnapshot = {
  progress: DailyGoalProgress[];
  /** Workouts with a set done today. */
  sessions: number;
  /** Seconds of timed work today, across all exercises. */
  seconds: number;
};

export async function getDailyGoalsSnapshot(now = new Date()): Promise<DailyGoalsSnapshot> {
  const [goals, sets] = await Promise.all([listDailyGoals(), listTodaySets(now)]);
  return {
    progress: goals.map((goal) => dailyGoalProgress(goal, sets)),
    sessions: new Set(sets.map((set) => set.workoutId)).size,
    seconds: sets.reduce((total, set) => total + (set.durationSec ?? 0), 0),
  };
}
