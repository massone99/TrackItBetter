import { and, eq, gte, ne } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, settings, trainingSets, workouts } from '../../db/schema';
import { dailyGoalProgress, deriveWeeklyGoals, type WeeklyDerivation, isValidDailyGoal, MAX_DAILY_GOALS, parseDailyGoals, startOfToday, startOfWeek, type DailyGoal, type DailyGoalProgress, type DaySet, type GoalPeriod } from '../../domain/dailyGoals';
import { applyGoalChange, type GoalChange } from '../../domain/tagGoals';
import { rowCategories } from '../analytics/summary';
import { exerciseMovementTags } from '../exercises/movementCatalog';

/** The goals of one period (a day or a week), kept as one JSON setting. */
function goalStore(period: GoalPeriod) {
  const key = period === 'week' ? 'weekly_goals' : 'daily_goals';

  async function list(): Promise<DailyGoal[]> {
    await initializeDatabase();
    const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
    return parseDailyGoals(row?.value, period);
  }

  async function save(goals: readonly DailyGoal[]): Promise<void> {
    if (goals.length > MAX_DAILY_GOALS || !goals.every((goal) => isValidDailyGoal(goal, period))) throw new RangeError('Invalid goals');
    const value = JSON.stringify(goals);
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  }

  /** Adds a goal, or updates the one with the same id. */
  async function put(goal: Omit<DailyGoal, 'id'> & { id?: string }): Promise<DailyGoal> {
    const goals = await list();
    const saved: DailyGoal = { ...goal, id: goal.id ?? Crypto.randomUUID() };
    const index = goals.findIndex((item) => item.id === saved.id);
    await save(index >= 0 ? goals.map((item, i) => (i === index ? saved : item)) : [...goals, saved]);
    return saved;
  }

  /** Adds, updates and removes several goals in one save (the sheet of a movement tag edits up to three). */
  async function apply(change: GoalChange): Promise<void> {
    await save(applyGoalChange(await list(), change, () => Crypto.randomUUID()));
  }

  /** Puts the goals in the order of `ids` (the goals not named keep their relative order at the end). */
  async function reorder(ids: readonly string[]): Promise<void> {
    const goals = await list();
    const first = ids.map((id) => goals.find((goal) => goal.id === id)).filter((goal): goal is DailyGoal => goal !== undefined);
    await save([...first, ...goals.filter((goal) => !ids.includes(goal.id))]);
  }

  /** Removes a goal and returns it with its place, so the removal can be undone. */
  async function remove(id: string): Promise<{ goal: DailyGoal; index: number } | null> {
    const goals = await list();
    const index = goals.findIndex((goal) => goal.id === id);
    if (index < 0) return null;
    await save(goals.filter((goal) => goal.id !== id));
    return { goal: goals[index], index };
  }

  /** Puts a removed goal back where it was. */
  async function restore(goal: DailyGoal, index: number): Promise<void> {
    const goals = (await list()).filter((item) => item.id !== goal.id);
    goals.splice(Math.min(Math.max(0, index), goals.length), 0, goal);
    await save(goals);
  }

  /** A copy of a goal right after it. */
  async function duplicate(id: string): Promise<DailyGoal | null> {
    const goals = await list();
    const index = goals.findIndex((goal) => goal.id === id);
    if (index < 0 || goals.length >= MAX_DAILY_GOALS) return null;
    const copy = { ...goals[index], id: Crypto.randomUUID() };
    goals.splice(index + 1, 0, copy);
    await save(goals);
    return copy;
  }

  /** Moves a goal one place up (-1) or down (+1); goals keep this order. */
  async function move(id: string, delta: -1 | 1): Promise<void> {
    const goals = await list();
    const index = goals.findIndex((goal) => goal.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= goals.length) return;
    [goals[index], goals[target]] = [goals[target], goals[index]];
    await save(goals);
  }

  async function snapshot(now = new Date()): Promise<DailyGoalsSnapshot> {
    const [goals, sets] = await Promise.all([list(), listSetsSince(period === 'week' ? startOfWeek(now) : startOfToday(now))]);
    return {
      progress: goals.map((goal) => dailyGoalProgress(goal, sets)),
      sessions: new Set(sets.map((set) => set.workoutId)).size,
      seconds: sets.reduce((total, set) => total + (set.durationSec ?? 0), 0),
    };
  }

  return { list, put, apply, reorder, remove, restore, duplicate, move, snapshot };
}

const daily = goalStore('day');
const weekly = goalStore('week');

/** The goal functions of a period: 'day' for today's goals, 'week' for this week's. */
export const goalsOf = (period: GoalPeriod) => (period === 'week' ? weekly : daily);

export const listDailyGoals = daily.list;
export const putDailyGoal = daily.put;
export const removeDailyGoal = daily.remove;
export const restoreDailyGoal = daily.restore;
export const duplicateDailyGoal = daily.duplicate;
export const moveDailyGoal = daily.move;

/** Working sets completed since `since`, in any workout (finished or still going). */
export async function listSetsSince(since: Date): Promise<DaySet[]> {
  await initializeDatabase();
  const rows = await db.select({
    workoutId: workouts.id,
    workoutName: workouts.name,
    exerciseId: exercises.id,
    exerciseName: exercises.name,
    completedAt: trainingSets.completedAt,
    pairId: trainingSets.pairId,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    category: exercises.category,
    extraCategories: exercises.extraCategories,
    movementGroup: exercises.movementGroup,
    movementTag: exercises.movementTag,
    movementTags: exercises.movementTags,
    mobilityMode: exercises.mobilityMode,
  })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .where(and(gte(trainingSets.completedAt, since), ne(trainingSets.kind, 'warmup')));
  return rows.map((row) => ({
    workoutId: row.workoutId,
    workoutName: row.workoutName,
    exerciseId: row.exerciseId,
    exerciseName: row.exerciseName,
    completedAt: row.completedAt!,
    pairId: row.pairId,
    reps: row.reps,
    durationSec: row.durationSec,
    categories: rowCategories(row),
    group: row.movementGroup,
    tags: exerciseMovementTags(row),
    mobilityMode: row.mobilityMode,
  }));
}

export type DailyGoalsSnapshot = {
  progress: DailyGoalProgress[];
  /** Workouts with a set done today. */
  sessions: number;
  /** Seconds of timed work today, across all exercises. */
  seconds: number;
};

export const getDailyGoalsSnapshot = daily.snapshot;
export const getWeeklyGoalsSnapshot = weekly.snapshot;

/** Adds weekly goals derived from the daily ones (see `deriveWeeklyGoals`); returns what was added. */
export async function addWeeklyGoalsFromDaily(days: number): Promise<WeeklyDerivation> {
  const [dailyGoals, weeklyGoalsNow] = await Promise.all([daily.list(), weekly.list()]);
  const result = deriveWeeklyGoals(dailyGoals, weeklyGoalsNow, days, () => Crypto.randomUUID());
  for (const goal of result.add) await weekly.put(goal);
  return result;
}
