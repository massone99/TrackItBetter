import { DEFAULT_TIMED_CUES, TIMED_COUNTDOWN_SEC, parseTimedCues, parseTimedPlan, type TimedMethodCues, type TimedMethodPlan } from '../../domain/timedMethod';
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
export type TimedMethodConfig = Pick<TimedMethodPlan, 'blockSec' | 'holdSec' | 'restSec' | 'recoverySec' | 'testSec' | 'countdownSec'> & { cues: TimedMethodCues };
export const DEFAULT_TIMED_CONFIG: TimedMethodConfig = { blockSec: 180, holdSec: 10, restSec: 10, recoverySec: 240, testSec: 30, countdownSec: TIMED_COUNTDOWN_SEC, cues: DEFAULT_TIMED_CUES };
const configKey = (exerciseId: string) => `exercise.timedMethod.${exerciseId}`;

export function readTimedConfig(exerciseId: string): TimedMethodConfig {
  try {
    const raw = readPreference(configKey(exerciseId));
    const parsed = raw ? JSON.parse(raw) as Partial<TimedMethodConfig> : {};
    // The final hold is optional: 0 means "no final hold".
    const pick = (key: Exclude<keyof TimedMethodConfig, 'cues'>, min: number, max: number) => {
      const value = parsed[key];
      return value !== undefined && Number.isInteger(value) && value >= min && value <= max ? value : DEFAULT_TIMED_CONFIG[key];
    };
    return {
      blockSec: pick('blockSec', 30, 1800), holdSec: pick('holdSec', 5, 120), restSec: pick('restSec', 0, 120),
      recoverySec: pick('recoverySec', 30, 900), testSec: pick('testSec', 0, 300),
      countdownSec: pick('countdownSec', 0, 30), cues: parseTimedCues(parsed.cues),
    };
  } catch {
    return DEFAULT_TIMED_CONFIG;
  }
}

export function writeTimedConfig(exerciseId: string, config: TimedMethodConfig): void {
  writePreference(configKey(exerciseId), JSON.stringify(config));
}
