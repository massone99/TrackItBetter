import { parseTimedPlan, type TimedMethodPlan } from '../../domain/timedMethod';
import { readPreference, writePreference } from '../../shared/settings/preferences';

/** Where a workout's timed-method plan is kept on the device. */
export const timedPlanKey = (workoutId: string) => `workout.timedMethod.${workoutId}`;

export function readTimedPlan(workoutId: string): TimedMethodPlan | null {
  const plan = parseTimedPlan(readPreference(timedPlanKey(workoutId)));
  return plan?.workoutId === workoutId ? plan : null;
}

export function clearTimedPlan(workoutId: string): void {
  writePreference(timedPlanKey(workoutId), '');
}

/** Last settings used on an exercise, so the next time starts from them. */
export type TimedMethodConfig = Pick<TimedMethodPlan, 'blockSec' | 'holdSec' | 'restSec' | 'recoverySec' | 'testSec'>;
export const DEFAULT_TIMED_CONFIG: TimedMethodConfig = { blockSec: 180, holdSec: 10, restSec: 10, recoverySec: 240, testSec: 30 };
const configKey = (exerciseId: string) => `exercise.timedMethod.${exerciseId}`;

export function readTimedConfig(exerciseId: string): TimedMethodConfig {
  try {
    const raw = readPreference(configKey(exerciseId));
    const parsed = raw ? JSON.parse(raw) as Partial<TimedMethodConfig> : {};
    const pick = (key: keyof TimedMethodConfig) => (Number.isFinite(parsed[key]) && (parsed[key] as number) > 0 ? parsed[key] as number : DEFAULT_TIMED_CONFIG[key]);
    return { blockSec: pick('blockSec'), holdSec: pick('holdSec'), restSec: pick('restSec'), recoverySec: pick('recoverySec'), testSec: pick('testSec') };
  } catch {
    return DEFAULT_TIMED_CONFIG;
  }
}

export function writeTimedConfig(exerciseId: string, config: TimedMethodConfig): void {
  writePreference(configKey(exerciseId), JSON.stringify(config));
}
