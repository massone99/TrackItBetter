export interface ProgressionSet {
  reps?: number;
  durationSec?: number;
  addedLoadKg?: number;
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
    (target.addedLoadKg === undefined || (set.addedLoadKg ?? -Infinity) >= target.addedLoadKg),
  );
}

function validateTarget(target: ProgressionTarget): void {
  if (!Number.isInteger(target.sets) || target.sets < 1) {
    throw new RangeError('target.sets must be a positive integer');
  }
  if (target.reps === undefined && target.durationSec === undefined && target.addedLoadKg === undefined) {
    throw new TypeError('target must include reps, durationSec, or addedLoadKg');
  }
  for (const [name, value] of Object.entries(target)) {
    if (name !== 'sets' && value !== undefined && (!Number.isFinite(value) || value < 0)) {
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
