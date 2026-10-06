import { eq, isNotNull } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { settings, workouts } from '../../db/schema';
import { dateFromKey, dateKey } from '../../shared/utils/date';

const WEEKLY_TARGET_KEY = 'weekly_session_target';
const DEFAULT_WEEKLY_TARGET = 3;
const HEATMAP_DAYS = 91;

export type GoalAchievement = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number;
  target: number;
};

export type GoalSnapshot = {
  weeklyTarget: number;
  thisWeekSessions: number;
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  year: number;
  yearSessions: number;
  yearActiveDays: number;
  activeDays: { date: string; count: number }[];
  achievements: GoalAchievement[];
};

export async function getGoalSnapshot(now = new Date()): Promise<GoalSnapshot> {
  await initializeDatabase();
  const [completed, targetSetting] = await Promise.all([
    db.select({ startedAt: workouts.startedAt })
      .from(workouts)
      .where(isNotNull(workouts.endedAt))
      .orderBy(workouts.startedAt),
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, WEEKLY_TARGET_KEY)).get(),
  ]);

  const targetValue = Number(targetSetting?.value ?? DEFAULT_WEEKLY_TARGET);
  const weeklyTarget = Number.isInteger(targetValue) && targetValue >= 1 && targetValue <= 7
    ? targetValue
    : DEFAULT_WEEKLY_TARGET;
  const counts = new Map<string, number>();
  for (const workout of completed) {
    const date = dateKey(new Date(workout.startedAt));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const today = startOfLocalDay(now);
  const monday = startOfWeek(today);
  let thisWeekSessions = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(monday);
    day.setDate(day.getDate() + offset);
    thisWeekSessions += counts.get(dateKey(day)) ?? 0;
  }

  const heatmapStart = startOfWeek(today);
  heatmapStart.setDate(heatmapStart.getDate() - 12 * 7);
  const activeDays = Array.from({ length: HEATMAP_DAYS }, (_, index) => {
    const day = new Date(heatmapStart);
    day.setDate(day.getDate() + index);
    const date = dateKey(day);
    return { date, count: counts.get(date) ?? 0 };
  });

  const activeDates = [...counts.keys()].sort();
  const streaks = measureStreaks(activeDates, today);
  const totalSessions = completed.length;
  const year = now.getFullYear();
  const yearRows = completed.filter((workout) => new Date(workout.startedAt).getFullYear() === year);
  const yearActiveDays = new Set(yearRows.map((workout) => dateKey(new Date(workout.startedAt)))).size;

  return {
    weeklyTarget,
    thisWeekSessions,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    totalSessions,
    year,
    yearSessions: yearRows.length,
    yearActiveDays,
    activeDays,
    achievements: buildAchievements(totalSessions, streaks.longest, thisWeekSessions, weeklyTarget),
  };
}

export async function saveWeeklyTarget(target: number): Promise<void> {
  if (!Number.isInteger(target) || target < 1 || target > 7) {
    throw new Error('Weekly target must be between 1 and 7 sessions.');
  }
  await initializeDatabase();
  await db.insert(settings)
    .values({ key: WEEKLY_TARGET_KEY, value: String(target) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(target) } });
}

function buildAchievements(total: number, longestStreak: number, thisWeek: number, weeklyTarget: number): GoalAchievement[] {
  return [
    { id: 'first-session', title: 'First step', description: 'Complete your first workout.', progress: Math.min(total, 1), target: 1, unlocked: total >= 1 },
    { id: 'five-sessions', title: 'Finding a rhythm', description: 'Complete five workouts.', progress: Math.min(total, 5), target: 5, unlocked: total >= 5 },
    { id: 'ten-sessions', title: 'Ten sessions strong', description: 'Complete ten workouts.', progress: Math.min(total, 10), target: 10, unlocked: total >= 10 },
    { id: 'week-goal', title: 'Weekly goal', description: `Reach your ${weeklyTarget}-session goal this week.`, progress: Math.min(thisWeek, weeklyTarget), target: weeklyTarget, unlocked: thisWeek >= weeklyTarget },
    { id: 'three-day-streak', title: 'Three-day streak', description: 'Train on three consecutive days.', progress: Math.min(longestStreak, 3), target: 3, unlocked: longestStreak >= 3 },
    { id: 'seven-day-streak', title: 'Seven-day streak', description: 'Train on seven consecutive days.', progress: Math.min(longestStreak, 7), target: 7, unlocked: longestStreak >= 7 },
  ];
}

function measureStreaks(sortedDates: string[], today: Date): { current: number; longest: number } {
  let longest = 0;
  let run = 0;
  let previous: Date | undefined;
  for (const key of sortedDates) {
    const date = dateFromKey(key);
    const isNext = previous !== undefined && daysBetween(previous, date) === 1;
    run = isNext ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  const activeSet = new Set(sortedDates);
  let current = 0;
  const mostRecentAllowed = new Date(today);
  if (!activeSet.has(dateKey(mostRecentAllowed))) mostRecentAllowed.setDate(mostRecentAllowed.getDate() - 1);
  while (activeSet.has(dateKey(mostRecentAllowed))) {
    current += 1;
    mostRecentAllowed.setDate(mostRecentAllowed.getDate() - 1);
  }
  return { current, longest };
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfWeek(value: Date): Date {
  const day = startOfLocalDay(value);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function daysBetween(first: Date, second: Date): number {
  return Math.round((second.getTime() - first.getTime()) / 86_400_000);
}
