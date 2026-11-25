/**
 * Timed method: a block of repeated holds and rests (e.g. 3 min of 10 s hold / 10 s rest), a recovery, then one
 * attempt at a single long hold (e.g. 30 s) at the same stretch level. Everything is read from timestamps, so the
 * screen can be left or the phone locked without losing the place.
 *
 * On a rep exercise (`kind: 'reps'`) the hold is a work interval: `repsPerRound` reps at its start (usually 1 every
 * 10 s), correctable round by round, and the optional final part is one set of as many reps as possible.
 */
export interface TimedMethodPlan {
  workoutId: string;
  entryId: string;
  /** When the countdown before the block started (ms). */
  startedAt: number;
  countdownSec: number;
  cues?: TimedMethodCues;
  /** Frozen when ending the method, so retrying a save cannot extend a hold. */
  stoppedAt?: number;
  /** Length of the whole block; it holds as many full hold + rest cycles as fit. */
  blockSec: number;
  holdSec: number;
  restSec: number;
  recoverySec: number;
  /** Goal of the final single hold; 0 when there is none (the method ends with the block). */
  testSec: number;
  /** Set when the recovery is cut short by hand (ms). */
  recoveryEndedAt: number | null;
  /** When the final hold counts from (ms): the tap on Start plus the countdown. */
  testStartedAt: number | null;
  /** When the final hold was ended (ms). */
  testEndedAt: number | null;
  /** Older plans that already saved the block as one aggregate set. */
  blockSaved: boolean;
  /** Absent on holds (every plan before reps existed). */
  kind?: TimedMethodKind;
  /** Exercise of the entry, so the last max set can start the next one. */
  exerciseId?: string;
  /** Reps planned in each work interval (reps plans). */
  repsPerRound?: number;
  /** Reps actually done in a round (1-based), when corrected from the plan. */
  roundReps?: Record<string, number>;
  /** Reps plans: recovery and one max-reps set after the block. */
  maxSet?: boolean;
  /** Reps of the final max set, as counted on the stage. */
  maxReps?: number | null;
}

export type TimedMethodKind = 'hold' | 'reps';

/** Rep exercises run the reps variant; everything measured in time keeps the holds. */
export const timedKindFor = (metric: string): TimedMethodKind => (metric === 'reps' || metric === 'reps_load' ? 'reps' : 'hold');

export const isRepsPlan = (plan: Pick<TimedMethodPlan, 'kind'>): boolean => plan.kind === 'reps';

/** Whether the block is followed by a recovery and a final attempt (a long hold, or a max-reps set). */
export function hasFinal(plan: Pick<TimedMethodPlan, 'kind' | 'maxSet' | 'testSec'>): boolean {
  return isRepsPlan(plan) ? plan.maxSet === true : plan.testSec > 0;
}

/** Reps done in a round of a reps plan: the correction if any, else the plan. */
export function repsOfRound(plan: Pick<TimedMethodPlan, 'repsPerRound' | 'roundReps'>, round: number): number {
  return plan.roundReps?.[String(round)] ?? plan.repsPerRound ?? 1;
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

export interface TimedMethodCues {
  warningSec: number;
  intervalWarnings: boolean;
  holdStart: boolean;
  restStart: boolean;
  milestones: boolean;
}

export const DEFAULT_TIMED_CUES: TimedMethodCues = {
  warningSec: 3,
  intervalWarnings: false,
  holdStart: true,
  restStart: true,
  milestones: true,
};

export function parseTimedCues(cues: Partial<TimedMethodCues> | null | undefined): TimedMethodCues {
  const warningSec = cues?.warningSec;
  return {
    warningSec: warningSec !== undefined && Number.isInteger(warningSec) && warningSec >= 0 && warningSec <= 10
      ? warningSec : DEFAULT_TIMED_CUES.warningSec,
    intervalWarnings: cues?.intervalWarnings === true,
    holdStart: cues?.holdStart !== false,
    restStart: cues?.restStart !== false,
    milestones: cues?.milestones !== false,
  };
}

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
  if (!hasFinal(plan)) return { phase: 'done', seconds: 0 };
  if (plan.testStartedAt === null) {
    const over = recoveryEnd(plan);
    return now < over ? { phase: 'recovery', secondsLeft: Math.max(1, Math.ceil((over - now) / 1000)) } : { phase: 'ready' };
  }
  if (plan.testEndedAt !== null) return { phase: 'done', seconds: Math.max(0, Math.round((plan.testEndedAt - plan.testStartedAt) / 1000)) };
  if (now < plan.testStartedAt) return { phase: 'testCountdown', secondsLeft: Math.ceil((plan.testStartedAt - now) / 1000) };
  return { phase: 'test', seconds: Math.floor((now - plan.testStartedAt) / 1000) };
}

/** A transition wins over a warning tick, and each warning is played once per second. */
export function timedCue(previous: TimedMethodPhase | null, current: TimedMethodPhase, cues = DEFAULT_TIMED_CUES, goalSec = 0): 'tick' | 'go' | 'done' | null {
  const changedPhase = previous?.phase !== current.phase;
  if (current.phase === 'done' || current.phase === 'ready') {
    return previous && changedPhase && cues.milestones ? 'done' : null;
  }
  if (current.phase === 'recovery' && changedPhase && cues.milestones) return 'done';
  if (current.phase === 'test') {
    if (changedPhase) return cues.holdStart ? 'go' : null;
    return cues.milestones && goalSec > 0 && previous?.phase === 'test' && previous.seconds < goalSec && current.seconds >= goalSec ? 'done' : null;
  }
  const newRound = 'round' in current && previous && 'round' in previous && previous.round !== current.round;
  if (current.phase === 'hold' && (changedPhase || newRound) && cues.holdStart) return 'go';
  if (current.phase === 'rest' && changedPhase && cues.restStart) return 'tick';
  const canWarn = current.phase === 'countdown' || current.phase === 'testCountdown' || cues.intervalWarnings;
  return canWarn && current.secondsLeft <= cues.warningSec &&
    (changedPhase || newRound || (previous && 'secondsLeft' in previous && previous.secondsLeft !== current.secondsLeft)) ? 'tick' : null;
}

export interface TimedHold {
  seconds: number;
  /** Reps plans: the reps of the round or of the max set (the set then has no duration). */
  reps?: number;
  completedAt: Date;
  restSec: number | null;
}

/**
 * One measured set per hold (or work interval). A partial one counts once a whole second has elapsed. A max set
 * with no reps counted is not a set.
 */
export function timedHolds(plan: TimedMethodPlan, until: number, finish: boolean): TimedHold[] {
  const rounds = timedRounds(plan);
  const start = blockStart(plan);
  const cycleMs = (plan.holdSec + plan.restSec) * 1000;
  const sets: TimedHold[] = [];
  // Older versions already saved an aggregate set. Continue from there on a restored plan.
  if (!plan.blockSaved) {
    for (let index = 0; index < rounds; index++) {
      const begins = start + index * cycleMs;
      const ends = Math.min(until, begins + plan.holdSec * 1000);
      const seconds = Math.floor((ends - begins) / 1000);
      if (seconds < 1) break;
      const restSec = Math.floor(Math.max(0, Math.min(until - ends, plan.restSec * 1000)) / 1000);
      sets.push(isRepsPlan(plan)
        ? { seconds, reps: repsOfRound(plan, index + 1), completedAt: new Date(ends), restSec }
        : { seconds, completedAt: new Date(ends), restSec });
    }
  }
  if (finish && plan.testStartedAt !== null) {
    const ends = plan.testEndedAt ?? until;
    const seconds = Math.floor((ends - plan.testStartedAt) / 1000);
    if (isRepsPlan(plan)) {
      const reps = plan.maxReps ?? 0;
      if (seconds >= 1 && reps >= 1) sets.push({ seconds, reps, completedAt: new Date(ends), restSec: null });
    } else if (seconds >= 1) sets.push({ seconds, completedAt: new Date(ends), restSec: null });
  }
  return sets;
}

export function parseTimedPlan(raw: string | null): TimedMethodPlan | null {
  if (!raw) return null;
  try {
    const plan = JSON.parse(raw) as TimedMethodPlan;
    const numbers = [plan.startedAt, plan.countdownSec, plan.blockSec, plan.holdSec, plan.restSec, plan.recoverySec, plan.testSec];
    const valid = typeof plan.workoutId === 'string' && typeof plan.entryId === 'string' && numbers.every((value) => Number.isFinite(value))
      && plan.holdSec > 0 && plan.restSec >= 0 && plan.blockSec > 0 && typeof plan.blockSaved === 'boolean';
    if (!valid) return null;
    const parsed: TimedMethodPlan = { ...plan, recoveryEndedAt: plan.recoveryEndedAt ?? null, testStartedAt: plan.testStartedAt ?? null, testEndedAt: plan.testEndedAt ?? null, cues: parseTimedCues(plan.cues) };
    if (plan.kind !== 'reps') return parsed;
    const count = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 999 ? value as number : null);
    const roundReps: Record<string, number> = {};
    for (const [round, reps] of Object.entries(plan.roundReps ?? {})) if (count(reps) !== null) roundReps[round] = reps;
    return { ...parsed, kind: 'reps', testSec: 0, repsPerRound: Math.max(1, count(plan.repsPerRound) ?? 1), roundReps, maxSet: plan.maxSet === true, maxReps: count(plan.maxReps) };
  } catch {
    return null;
  }
}
