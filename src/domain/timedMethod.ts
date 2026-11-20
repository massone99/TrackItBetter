/**
 * Timed method: a block of repeated holds and rests (e.g. 3 min of 10 s hold / 10 s rest), a recovery, then one
 * attempt at a single long hold (e.g. 30 s) at the same stretch level. Everything is read from timestamps, so the
 * screen can be left or the phone locked without losing the place.
 */
export interface TimedMethodPlan {
  workoutId: string;
  entryId: string;
  /** When the countdown before the block started (ms). */
  startedAt: number;
  countdownSec: number;
  /** Length of the whole block; it holds as many full hold + rest cycles as fit. */
  blockSec: number;
  holdSec: number;
  restSec: number;
  recoverySec: number;
  /** Goal of the final single hold. */
  testSec: number;
  /** Set when the recovery is cut short by hand (ms). */
  recoveryEndedAt: number | null;
  /** When the final hold counts from (ms): the tap on Start plus the countdown. */
  testStartedAt: number | null;
  /** When the final hold was ended (ms). */
  testEndedAt: number | null;
  /** The block's set is already saved. */
  blockSaved: boolean;
}

export type TimedMethodPhase =
  | { phase: 'countdown'; secondsLeft: number }
  | { phase: 'hold' | 'rest'; round: number; secondsLeft: number }
  | { phase: 'recovery'; secondsLeft: number }
  | { phase: 'ready' }
  | { phase: 'testCountdown'; secondsLeft: number }
  | { phase: 'test'; seconds: number }
  | { phase: 'done'; seconds: number };

export const TIMED_COUNTDOWN_SEC = 5;

/** Full hold + rest cycles in the block. */
export function timedRounds(plan: Pick<TimedMethodPlan, 'blockSec' | 'holdSec' | 'restSec'>): number {
  return Math.max(1, Math.floor(plan.blockSec / (plan.holdSec + plan.restSec)));
}

export function blockStart(plan: Pick<TimedMethodPlan, 'startedAt' | 'countdownSec'>): number {
  return plan.startedAt + plan.countdownSec * 1000;
}

/** When the last cycle ends (ms). */
export function blockEnd(plan: Pick<TimedMethodPlan, 'startedAt' | 'countdownSec' | 'blockSec' | 'holdSec' | 'restSec'>): number {
  return blockStart(plan) + timedRounds(plan) * (plan.holdSec + plan.restSec) * 1000;
}

/** Seconds actually held in the block: what its set records. */
export function blockHoldSec(plan: Pick<TimedMethodPlan, 'blockSec' | 'holdSec' | 'restSec'>): number {
  return timedRounds(plan) * plan.holdSec;
}

export function recoveryEnd(plan: TimedMethodPlan): number {
  return plan.recoveryEndedAt ?? blockEnd(plan) + plan.recoverySec * 1000;
}

export function timedPhase(plan: TimedMethodPlan, now: number): TimedMethodPhase {
  const start = blockStart(plan);
  if (now < start) return { phase: 'countdown', secondsLeft: Math.ceil((start - now) / 1000) };
  const end = blockEnd(plan);
  if (now < end) {
    const cycle = (plan.holdSec + plan.restSec) * 1000;
    const into = now - start;
    const round = Math.floor(into / cycle) + 1;
    const inCycle = into - (round - 1) * cycle;
    const holding = inCycle < plan.holdSec * 1000;
    const phaseEnd = holding ? plan.holdSec * 1000 : cycle;
    return { phase: holding ? 'hold' : 'rest', round, secondsLeft: Math.max(1, Math.ceil((phaseEnd - inCycle) / 1000)) };
  }
  if (plan.testStartedAt === null) {
    const over = recoveryEnd(plan);
    return now < over ? { phase: 'recovery', secondsLeft: Math.max(1, Math.ceil((over - now) / 1000)) } : { phase: 'ready' };
  }
  if (plan.testEndedAt !== null) return { phase: 'done', seconds: Math.max(0, Math.round((plan.testEndedAt - plan.testStartedAt) / 1000)) };
  if (now < plan.testStartedAt) return { phase: 'testCountdown', secondsLeft: Math.ceil((plan.testStartedAt - now) / 1000) };
  return { phase: 'test', seconds: Math.floor((now - plan.testStartedAt) / 1000) };
}

/** Sound between two phases: ticks for the last 3 seconds, go when a hold starts, a softer one when rest starts, done at the end. */
export function timedCue(previous: TimedMethodPhase | null, current: TimedMethodPhase): 'tick' | 'go' | 'done' | null {
  if (current.phase === 'done') return previous?.phase === 'done' ? null : 'done';
  if (current.phase === 'ready') return previous && previous.phase !== 'ready' ? 'done' : null;
  if (current.phase === 'test') return previous?.phase === 'testCountdown' ? 'go' : null;
  if (current.phase === 'hold') return previous && (previous.phase === 'countdown' || previous.phase === 'rest') ? 'go' : null;
  if (current.phase === 'rest') return previous?.phase === 'hold' ? 'tick' : null;
  if (current.phase === 'recovery') return null;
  const secondsLeft = current.phase === 'countdown' || current.phase === 'testCountdown' ? current.secondsLeft : null;
  if (secondsLeft === null) return null;
  const changed = !previous || previous.phase !== current.phase || ('secondsLeft' in previous && previous.secondsLeft !== secondsLeft);
  return changed && secondsLeft <= 3 ? 'tick' : null;
}

/** "Timed 9 × 10″/10″": the note that keeps the context of the sets. */
export function timedLabel(plan: Pick<TimedMethodPlan, 'blockSec' | 'holdSec' | 'restSec'>): string {
  return `Timed ${timedRounds(plan)} × ${plan.holdSec}″/${plan.restSec}″`;
}

export function parseTimedPlan(raw: string | null): TimedMethodPlan | null {
  if (!raw) return null;
  try {
    const plan = JSON.parse(raw) as TimedMethodPlan;
    const numbers = [plan.startedAt, plan.countdownSec, plan.blockSec, plan.holdSec, plan.restSec, plan.recoverySec, plan.testSec];
    const valid = typeof plan.workoutId === 'string' && typeof plan.entryId === 'string' && numbers.every((value) => Number.isFinite(value))
      && plan.holdSec > 0 && plan.restSec >= 0 && plan.blockSec > 0 && typeof plan.blockSaved === 'boolean';
    return valid ? { ...plan, recoveryEndedAt: plan.recoveryEndedAt ?? null, testStartedAt: plan.testStartedAt ?? null, testEndedAt: plan.testEndedAt ?? null } : null;
  } catch {
    return null;
  }
}
