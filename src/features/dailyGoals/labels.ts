import type { TFunction } from 'i18next';
import type { DailyGoal, DailyGoalMeasure } from '../../domain/dailyGoals';
import { movementTagLabel } from '../exercises/ClassificationChoices';
import { formatClock } from '../../shared/utils/format';

/** What a goal counts, in words: "Push", "Vertical pull", "Hip flexion". */
export function goalKeyLabel(goal: Pick<DailyGoal, 'scope' | 'key'> & { mobilityMode?: DailyGoal['mobilityMode'] }, t: TFunction): string {
  if (goal.scope === 'category') return t(`library.category.${goal.key}`, { defaultValue: goal.key });
  if (goal.scope === 'group') return t(`movement.groups.${goal.key}`, { defaultValue: goal.key });
  const tag = movementTagLabel(goal.key, (key, options) => t(key, options));
  // "Hip flexion · Active": the same tag counted apart for active or passive mobility.
  return goal.mobilityMode ? `${tag} · ${t(`customExercise.mobilityMode.${goal.mobilityMode}`)}` : tag;
}

/** An amount in the goal's measure: 1:30 for time, 30 for reps. */
export function goalAmount(measure: DailyGoalMeasure, value: number): string {
  return measure === 'minutes' ? formatClock(value) : String(Math.round(value));
}
