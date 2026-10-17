import { useTranslation } from 'react-i18next';
import type { GoalPeriod } from '../../domain/dailyGoals';

/**
 * Text of the goals screens for a period. Weekly goals reuse the daily wording except where it says
 * "today" or "day": those keys exist under `weeklyGoals` and win for the week.
 */
export function useGoalT(period: GoalPeriod) {
  const { t } = useTranslation();
  return (key: string, options?: Record<string, unknown>): string => t(period === 'week' ? [`weeklyGoals.${key}`, `dailyGoals.${key}`] : `dailyGoals.${key}`, options) as string;
}
