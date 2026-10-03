/** Every-minute-on-the-minute: a fixed interval per round, one set recorded when each round ends. */
export interface EmomPlan {
  workoutId: string;
  entryId: string;
  /** When the countdown before round 1 started (ms). */
  startedAt: number;
  countdownSec: number;
  intervalSec: number;
  rounds: number;
  /** Reps, or seconds for a hold, that every round aims for. */
  target: number;
  /** Value for the round in progress; back to `target` once that round is recorded. */
  value: number;
  field: 'reps' | 'durationSec';
}

export type EmomPhase =
  | { phase: 'countdown'; secondsLeft: number }
  | { phase: 'running'; round: number; secondsLeft: number }
  | { phase: 'done' };

export const EMOM_COUNTDOWN_SEC = 5;

/** Start of round 1 (ms). */
export function firstRoundStart(plan: Pick<EmomPlan, 'startedAt' | 'countdownSec'>): number {
  return plan.startedAt + plan.countdownSec * 1000;
}

/** When round `round` (1-based) ends: the moment its set is recorded. */
export function roundEndsAt(plan: Pick<EmomPlan, 'startedAt' | 'countdownSec' | 'intervalSec'>, round: number): number {
  return firstRoundStart(plan) + round * plan.intervalSec * 1000;
}

/** Rounds whose time is over at `now`, never more than planned. */
export function roundsDue(plan: Pick<EmomPlan, 'startedAt' | 'countdownSec' | 'intervalSec' | 'rounds'>, now: number): number {
  const elapsed = now - firstRoundStart(plan);
  if (elapsed < 0) return 0;
  return Math.min(plan.rounds, Math.floor(elapsed / (plan.intervalSec * 1000)));
}

export function emomPhase(plan: EmomPlan, now: number): EmomPhase {
  const start = firstRoundStart(plan);
  if (now < start) return { phase: 'countdown', secondsLeft: Math.ceil((start - now) / 1000) };
  const due = roundsDue(plan, now);
  if (due >= plan.rounds) return { phase: 'done' };
  const round = due + 1;
  return { phase: 'running', round, secondsLeft: Math.max(1, Math.ceil((roundEndsAt(plan, round) - now) / 1000)) };
}

/** Sound between two consecutive phases: ticks for the last 3 seconds, go when a round starts, done at the end. */
export function emomCue(previous: EmomPhase | null, current: EmomPhase): 'tick' | 'go' | 'done' | null {
  if (current.phase === 'done') return previous?.phase === 'done' ? null : 'done';
  if (current.phase === 'running' && (previous?.phase === 'countdown' || (previous?.phase === 'running' && previous.round !== current.round))) return 'go';
  const changed = !previous || previous.phase === 'done' || previous.secondsLeft !== current.secondsLeft;
  return changed && current.secondsLeft <= 3 ? 'tick' : null;
}

/** "EMOM 10 × 1′" or "EMOM 8 × 30″": the note that keeps the context of the sets. */
export function emomLabel(plan: Pick<EmomPlan, 'rounds' | 'intervalSec'>): string {
  const interval = plan.intervalSec % 60 === 0 ? `${plan.intervalSec / 60}′` : plan.intervalSec > 60 ? `${Math.floor(plan.intervalSec / 60)}′${plan.intervalSec % 60}″` : `${plan.intervalSec}″`;
  return `EMOM ${plan.rounds} × ${interval}`;
}

export function parseEmomPlan(raw: string | null): EmomPlan | null {
  if (!raw) return null;
  try {
    const plan = JSON.parse(raw) as EmomPlan;
    const valid = typeof plan.workoutId === 'string' && typeof plan.entryId === 'string'
      && [plan.startedAt, plan.countdownSec, plan.intervalSec, plan.rounds, plan.target, plan.value].every((value) => Number.isFinite(value))
      && plan.intervalSec > 0 && plan.rounds > 0 && (plan.field === 'reps' || plan.field === 'durationSec');
    return valid ? plan : null;
  } catch {
    return null;
  }
}
