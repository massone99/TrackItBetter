import { DEFAULT_TIMED_CUES, TIMED_COUNTDOWN_SEC, parseTimedCues, parseTimedPlan, type TimedMethodCues, type TimedMethodKind, type TimedMethodPlan } from '../../domain/timedMethod';
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

/**
 * Last settings used on an exercise, so the next time starts from them. Reps plans also keep the reps per interval,
 * whether the max set is on and the reps of the last max set (the next one starts from it).
 */
export type TimedMethodConfig = Pick<TimedMethodPlan, 'blockSec' | 'holdSec' | 'restSec' | 'recoverySec' | 'testSec' | 'countdownSec'> & {
  cues: TimedMethodCues;
  kind?: TimedMethodKind;
  repsPerRound?: number;
  maxSet?: boolean;
  lastMaxReps?: number | null;
};
export const DEFAULT_TIMED_CONFIG: TimedMethodConfig = { blockSec: 180, holdSec: 10, restSec: 10, recoverySec: 240, testSec: 30, countdownSec: TIMED_COUNTDOWN_SEC, cues: DEFAULT_TIMED_CUES };
/** Reps: one rep at the start of every 10 s interval, no extra break, no max set. */
export const DEFAULT_TIMED_REPS_CONFIG: TimedMethodConfig = { ...DEFAULT_TIMED_CONFIG, restSec: 0, testSec: 0, kind: 'reps', repsPerRound: 1, maxSet: false, lastMaxReps: null };
const configKey = (exerciseId: string) => `exercise.timedMethod.${exerciseId}`;

export function readTimedConfig(exerciseId: string, kind: TimedMethodKind = 'hold'): TimedMethodConfig {
  if (kind === 'reps') return readRepsConfig(exerciseId);
  try {
    const raw = readPreference(configKey(exerciseId));
    const parsed = raw ? JSON.parse(raw) as Partial<TimedMethodConfig> : {};
    // The final hold is optional: 0 means "no final hold".
    const pick = (key: 'blockSec' | 'holdSec' | 'restSec' | 'recoverySec' | 'testSec' | 'countdownSec', min: number, max: number) => {
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

/** Reps settings live next to the hold ones, so an exercise switched between measures keeps both. */
const repsConfigKey = (exerciseId: string) => `exercise.timedMethod.reps.${exerciseId}`;

function readRepsConfig(exerciseId: string): TimedMethodConfig {
  try {
    const raw = readPreference(repsConfigKey(exerciseId));
    const parsed = raw ? JSON.parse(raw) as Partial<TimedMethodConfig> : {};
    const base = DEFAULT_TIMED_REPS_CONFIG;
    const pick = (value: unknown, fallback: number, min: number, max: number) => (Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? value as number : fallback);
    return {
      ...base,
      blockSec: pick(parsed.blockSec, base.blockSec, 30, 1800), holdSec: pick(parsed.holdSec, base.holdSec, 5, 120),
      restSec: pick(parsed.restSec, base.restSec, 0, 120), recoverySec: pick(parsed.recoverySec, base.recoverySec, 30, 900),
      countdownSec: pick(parsed.countdownSec, base.countdownSec, 0, 30), cues: parseTimedCues(parsed.cues),
      repsPerRound: pick(parsed.repsPerRound, 1, 1, 30), maxSet: parsed.maxSet === true,
      lastMaxReps: parsed.lastMaxReps == null ? null : pick(parsed.lastMaxReps, 0, 0, 999) || null,
    };
  } catch {
    return DEFAULT_TIMED_REPS_CONFIG;
  }
}

export function writeTimedConfig(exerciseId: string, config: TimedMethodConfig): void {
  writePreference(config.kind === 'reps' ? repsConfigKey(exerciseId) : configKey(exerciseId), JSON.stringify(config));
}

/** Remembers the reps of a finished max set, so the next one starts from it. */
export function rememberMaxReps(exerciseId: string, reps: number): void {
  writeTimedConfig(exerciseId, { ...readRepsConfig(exerciseId), lastMaxReps: reps });
}

/** The sets of a reps plan laid out for the narrated session (`planTimedRepsSets`), so it narrates only them. */
export interface TimedNarration { entryId: string; setIds: string[]; prepSec?: number }
const narrationKey = (workoutId: string) => `workout.timedNarration.${workoutId}`;

export function writeTimedNarration(workoutId: string, narration: TimedNarration | null): void {
  writePreference(narrationKey(workoutId), narration ? JSON.stringify(narration) : '');
}

export function readTimedNarration(workoutId: string): TimedNarration | null {
  try {
    const value = JSON.parse(readPreference(narrationKey(workoutId)) || 'null') as TimedNarration | null;
    return value && typeof value.entryId === 'string' && Array.isArray(value.setIds) && value.setIds.every((item) => typeof item === 'string')
      && (value.prepSec === undefined || (Number.isInteger(value.prepSec) && value.prepSec >= 0 && value.prepSec <= 30)) ? value : null;
  } catch {
    return null;
  }
}
