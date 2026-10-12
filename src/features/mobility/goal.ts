import { readPreference, writePreference } from '../../shared/settings/preferences';

const KEY = 'mobility.weeklyGoalMin';
export const GOAL_PRESETS_MIN = [30, 60, 90, 120, 150] as const;

/** Weekly mobility goal in minutes; 0 when none is set. */
export function readWeeklyGoalMin(): number {
  const raw = readPreference(KEY);
  const value = raw === null ? NaN : Number(raw);
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : 0;
}

export function writeWeeklyGoalMin(minutes: number): void {
  writePreference(KEY, String(Math.max(0, Math.min(1000, Math.round(minutes)))));
}
