export interface ProgressionSet {
  reps?: number;
  durationSec?: number;
  addedLoadKg?: number;
  /** Form cleanliness of the set, 1–5; null/undefined when unrated. */
  formRating?: number | null;
  /** Rate of perceived exertion, 6–10; null/undefined when unrated. */
  rpe?: number | null;
  /** True when resistance bands assisted this set. */
  assisted?: boolean;
}

export interface ProgressionSession {
  /** Set false for abandoned or otherwise incomplete sessions. */
  completed: boolean;
  sets: readonly ProgressionSet[];
}

export interface ProgressionTarget {
  /** Number of sets that must meet the target. */
  sets: number;
  reps?: number;
  durationSec?: number;
  addedLoadKg?: number;
  /** Minimum form rating (1–5) each counted set must meet; omitted means no form gate. */
  minForm?: number;
  /** Maximum RPE (6–10) each counted set must stay at or below; omitted means no RPE gate. */
  maxRpe?: number;
}

export type ProgressionAction =
  | { kind: 'increase_reps'; amount: number }
  | { kind: 'increase_duration'; amount: number }
  | { kind: 'increase_load'; amountKg: number }
  | { kind: 'advance_level'; nextLevelId: string };

export interface ProgressionRule {
  /** Number of consecutive successful sessions needed to advance. */
  successfulSessionsToProgress: number;
  action: ProgressionAction;
}

export interface ProgressionEvaluation {
  eligible: boolean;
  consecutiveSuccessfulSessions: number;
  action: ProgressionAction | null;
}

/** Evaluate recent sessions in newest-first order against the target. */
export function evaluateProgression(
  target: ProgressionTarget,
  rule: ProgressionRule,
  recentSessions: readonly ProgressionSession[],
): ProgressionEvaluation {
  validateTarget(target);
  validateRule(rule);

  let consecutiveSuccessfulSessions = 0;
  for (const session of recentSessions) {
    if (!meetsTarget(session, target)) break;
    consecutiveSuccessfulSessions += 1;
  }

  const eligible = consecutiveSuccessfulSessions >= rule.successfulSessionsToProgress;
  return {
    eligible,
    consecutiveSuccessfulSessions,
    action: eligible ? rule.action : null,
  };
}

export function meetsProgressionTarget(
  session: ProgressionSession,
  target: ProgressionTarget,
): boolean {
  validateTarget(target);
  return meetsTarget(session, target);
}

function meetsTarget(session: ProgressionSession, target: ProgressionTarget): boolean {
  if (!session.completed || session.sets.length < target.sets) return false;
  return session.sets.slice(0, target.sets).every((set) =>
    (target.reps === undefined || (set.reps ?? -Infinity) >= target.reps) &&
    (target.durationSec === undefined || (set.durationSec ?? -Infinity) >= target.durationSec) &&
    (target.addedLoadKg === undefined || (set.addedLoadKg ?? -Infinity) >= target.addedLoadKg) &&
    (target.minForm === undefined || (set.formRating != null && set.formRating >= target.minForm)) &&
    (target.maxRpe === undefined || (set.rpe != null && set.rpe <= target.maxRpe)),
  );
}

function validateTarget(target: ProgressionTarget): void {
  if (!Number.isInteger(target.sets) || target.sets < 1) {
    throw new RangeError('target.sets must be a positive integer');
  }
  if (target.reps === undefined && target.durationSec === undefined && target.addedLoadKg === undefined) {
    throw new TypeError('target must include reps, durationSec, or addedLoadKg');
  }
  if (target.minForm !== undefined && (!Number.isFinite(target.minForm) || target.minForm < 1 || target.minForm > 5)) {
    throw new RangeError('target.minForm must be between 1 and 5');
  }
  if (target.maxRpe !== undefined && (!Number.isFinite(target.maxRpe) || target.maxRpe < 6 || target.maxRpe > 10)) {
    throw new RangeError('target.maxRpe must be between 6 and 10');
  }
  for (const [name, value] of Object.entries(target)) {
    if (name !== 'sets' && name !== 'minForm' && name !== 'maxRpe' && value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new RangeError(`target.${name} must be finite and non-negative`);
    }
  }
}

function validateRule(rule: ProgressionRule): void {
  if (!Number.isInteger(rule.successfulSessionsToProgress) || rule.successfulSessionsToProgress < 1) {
    throw new RangeError('successfulSessionsToProgress must be a positive integer');
  }
  const action = rule.action;
  if (action.kind === 'advance_level') {
    if (!action.nextLevelId.trim()) throw new TypeError('nextLevelId must not be empty');
  } else {
    const amount = action.kind === 'increase_load' ? action.amountKg : action.amount;
    if (!Number.isFinite(amount) || amount <= 0) throw new RangeError('progression amount must be positive');
  }
}

/** Input for an Overcoming Gravity-style next-session micro-progression cue. */
export interface NextStepInput {
  metric: string;
  /** Completed working sets from the most recent session, in order. */
  sets: readonly ProgressionSet[];
  /** Optional chain step criteria to work towards. */
  target?: ProgressionTarget | null;
  /** Next exercise in the chain, when one exists. */
  nextExerciseName?: string | null;
  /** Whether the current chain step criteria are already satisfied. */
  eligible?: boolean;
}

export type NextStepSuggestion =
  | { kind: 'consolidate_form'; avgForm: number }
  | { kind: 'consolidate_rpe'; avgRpe: number }
  | { kind: 'advance_hybrid'; nextExerciseName: string }
  | { kind: 'less_assistance' }
  | { kind: 'rep_addition'; scheme: number[]; unit: 'reps' | 'seconds' }
  | { kind: 'linear_bump'; scheme: number[]; unit: 'reps' | 'seconds' };

const CONSOLIDATE_FORM_BELOW = 3.5;
const CONSOLIDATE_RPE_AT = 9.5;
const EASY_RPE_MAX = 7.5;
const ASSIST_STEP_DOWN_RPE_MAX = 8;

function meanOf(values: readonly (number | null | undefined)[]): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

/**
 * Recommends the next OG2 Ch. 10 micro-progression from the last session:
 * 1. Consolidate when form is below 3.5 or effort is maxed out (RPE >= 9.5).
 * 2. Advance (or bridge with hybrid sets) when chain criteria are met and a next step exists.
 * 3. Reduce band assistance when sets were assisted and effort was controlled.
 * 4. Repetition addition (e.g. 5-5-5 → 6-5-5 → 6-6-5 → 6-6-6) or linear +1/+2 s across all sets when RPE <= 7.5.
 */
export function suggestNextStep(input: NextStepInput): NextStepSuggestion | null {
  if (input.sets.length === 0) return null;
  const avgForm = meanOf(input.sets.map((set) => set.formRating));
  if (avgForm !== null && avgForm < CONSOLIDATE_FORM_BELOW) {
    return { kind: 'consolidate_form', avgForm: Math.round(avgForm * 10) / 10 };
  }
  const avgRpe = meanOf(input.sets.map((set) => set.rpe));
  if (avgRpe !== null && avgRpe >= CONSOLIDATE_RPE_AT) {
    return { kind: 'consolidate_rpe', avgRpe: Math.round(avgRpe * 10) / 10 };
  }
  if (input.eligible && input.nextExerciseName) {
    return { kind: 'advance_hybrid', nextExerciseName: input.nextExerciseName };
  }
  if (input.sets.some((set) => set.assisted) && (input.eligible || avgRpe === null || avgRpe <= ASSIST_STEP_DOWN_RPE_MAX)) {
    return { kind: 'less_assistance' };
  }
  const isTimed = input.metric === 'time' || input.metric === 'time_load';
  const isReps = input.metric === 'reps' || input.metric === 'reps_load';
  if (!isTimed && !isReps) return null;
  const unit = isTimed ? 'seconds' : 'reps';
  const step = isTimed ? 2 : 1;
  const amounts = input.sets
    .map((set) => (isTimed ? set.durationSec : set.reps))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));
  if (amounts.length === 0) return null;

  const cap = isTimed ? input.target?.durationSec : input.target?.reps;
  if (cap !== undefined && !input.eligible && amounts.length >= (input.target?.sets ?? 1) && amounts.every((value) => value >= cap)) {
    return null;
  }

  const maxAmount = Math.max(...amounts);
  const unevenIndex = amounts.findIndex((value) => value < maxAmount);
  if (amounts.length >= 2 && unevenIndex >= 0) {
    const scheme = [...amounts];
    const bumped = Math.min(maxAmount, scheme[unevenIndex] + step);
    scheme[unevenIndex] = cap !== undefined ? Math.min(cap, bumped) : bumped;
    if (scheme.every((value, index) => value === amounts[index])) return null;
    return { kind: 'rep_addition', scheme, unit };
  }

  const bump = (value: number) => (cap !== undefined && !input.eligible ? Math.min(cap, value + step) : value + step);
  if (amounts.length === 1 || (avgRpe !== null && avgRpe <= EASY_RPE_MAX)) {
    const scheme = amounts.map(bump);
    if (scheme.every((value, index) => value === amounts[index])) return null;
    return { kind: 'linear_bump', scheme, unit };
  }

  const scheme = [...amounts];
  scheme[0] = bump(scheme[0]);
  if (scheme[0] === amounts[0]) return null;
  return { kind: 'rep_addition', scheme, unit };
}

/** Formats a per-set scheme cleanly, e.g. [6, 5, 5] → "6-5-5", [12, 10, 10] seconds → "12-10-10 s". */
export function formatNextStepScheme(scheme: readonly number[], unit: 'reps' | 'seconds'): string {
  const joined = scheme.join('-');
  return unit === 'seconds' ? `${joined} s` : joined;
}
