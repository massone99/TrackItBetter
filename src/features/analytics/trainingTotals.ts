import { MOVEMENT_GROUP_IDS } from '../exercises/movementCatalog';

export interface TrainingExercise {
  id: string;
  name: string;
  metric: string;
  movementTag: string | null;
  movementGroup: string | null;
}

export interface TrainingSetRecord {
  exerciseId: string;
  workoutStartedAt: Date;
  durationSec: number | null;
  rpe: number | null;
  kind: string;
}

export interface SetCounts { daily: number; weekly: number; dailyAtThreshold: number; weeklyAtThreshold: number }
export interface TrainingTotals {
  selectedDate: string;
  threshold: number;
  dailyHoldSeconds: number;
  weeklyHoldSeconds: number;
  tags: { id: string; dailyHoldSeconds: number; weeklyHoldSeconds: number }[];
  exercises: (SetCounts & { id: string; name: string })[];
  groups: (SetCounts & { id: string })[];
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateFromLocalKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function buildTrainingTotals(
  exercises: readonly TrainingExercise[],
  sets: readonly TrainingSetRecord[],
  tagIds: readonly string[],
  selectedDate: Date,
  threshold = 8,
): TrainingTotals {
  const dayKey = localDateKey(selectedDate);
  const start = dateFromLocalKey(dayKey);
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() - 6);
  const keyFor = (date: Date) => localDateKey(date);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const exerciseCounts = new Map<string, SetCounts>(exercises.map((exercise) => [exercise.id, emptyCounts()]));
  const groupCounts = new Map<string, SetCounts>(MOVEMENT_GROUP_IDS.map((id) => [id, emptyCounts()]));
  const tagSeconds = new Map<string, { daily: number; weekly: number }>(tagIds.map((id) => [id, { daily: 0, weekly: 0 }]));
  let dailyHoldSeconds = 0;
  let weeklyHoldSeconds = 0;

  for (const set of sets) {
    const dateKey = keyFor(set.workoutStartedAt);
    const daily = dateKey === dayKey;
    const weekly = dateKey >= keyFor(weekStart) && dateKey <= dayKey;
    if (!daily && !weekly) continue;
    const exercise = exerciseById.get(set.exerciseId);
    if (!exercise) continue;
    if (set.kind === 'working') {
      const counts = exerciseCounts.get(exercise.id)!;
      if (daily) counts.daily += 1;
      if (weekly) counts.weekly += 1;
      if (set.rpe != null && set.rpe >= threshold) {
        if (daily) counts.dailyAtThreshold += 1;
        if (weekly) counts.weeklyAtThreshold += 1;
      }
      const group = exercise.movementGroup;
      const groupSetCounts = group ? groupCounts.get(group) : undefined;
      if (groupSetCounts) {
        if (daily) groupSetCounts.daily += 1;
        if (weekly) groupSetCounts.weekly += 1;
        if (set.rpe != null && set.rpe >= threshold) {
          if (daily) groupSetCounts.dailyAtThreshold += 1;
          if (weekly) groupSetCounts.weeklyAtThreshold += 1;
        }
      }
    }
    if ((exercise.metric === 'time' || exercise.metric === 'time_load') && set.durationSec != null) {
      const seconds = Math.max(0, set.durationSec);
      if (daily) dailyHoldSeconds += seconds;
      if (weekly) weeklyHoldSeconds += seconds;
      const tag = exercise.movementTag ? tagSeconds.get(exercise.movementTag) : undefined;
      if (tag) {
        if (daily) tag.daily += seconds;
        if (weekly) tag.weekly += seconds;
      }
    }
  }

  return {
    selectedDate: dayKey,
    threshold,
    dailyHoldSeconds,
    weeklyHoldSeconds,
    tags: tagIds.map((id) => ({ id, dailyHoldSeconds: tagSeconds.get(id)!.daily, weeklyHoldSeconds: tagSeconds.get(id)!.weekly })),
    exercises: exercises.map(({ id, name }) => ({ id, name, ...exerciseCounts.get(id)! })),
    groups: MOVEMENT_GROUP_IDS.map((id) => ({ id, ...groupCounts.get(id)! })),
  };
}

function emptyCounts(): SetCounts { return { daily: 0, weekly: 0, dailyAtThreshold: 0, weeklyAtThreshold: 0 }; }
