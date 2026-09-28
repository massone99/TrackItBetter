/**
 * Hold timer: a short countdown with beeps, then the hold itself. In `free` mode the hold counts up
 * until stopped; in `target` mode it counts down from a set time and ends on its own.
 * Everything is derived from timestamps, so the display stays right after the app was paused.
 */

export type HoldMode = 'free' | 'target';

export const HOLD_COUNTDOWN_SEC = 5;

export interface HoldTimer {
  mode: HoldMode;
  /** Planned hold length in seconds (target mode). */
  targetSec: number;
  /** When the countdown ends and the hold starts, in ms. */
  holdStartsAt: number;
}

export type HoldPhase =
  | { phase: 'countdown'; secondsLeft: number }
  | { phase: 'running'; elapsed: number; remaining: number | null }
  | { phase: 'done'; elapsed: number };

export function startHold(now: number, mode: HoldMode, targetSec: number, countdownSec = HOLD_COUNTDOWN_SEC): HoldTimer {
  return { mode, targetSec: Math.max(1, Math.round(targetSec)), holdStartsAt: now + Math.max(0, countdownSec) * 1000 };
}

export function holdPhase(timer: HoldTimer, now: number): HoldPhase {
  if (now < timer.holdStartsAt) return { phase: 'countdown', secondsLeft: Math.ceil((timer.holdStartsAt - now) / 1000) };
  const elapsed = Math.floor((now - timer.holdStartsAt) / 1000);
  if (timer.mode === 'free') return { phase: 'running', elapsed, remaining: null };
  if (elapsed >= timer.targetSec) return { phase: 'done', elapsed: timer.targetSec };
  return { phase: 'running', elapsed, remaining: timer.targetSec - elapsed };
}

/** Seconds to record when the hold is stopped by hand: nothing during the countdown. */
export function recordedSeconds(phase: HoldPhase): number {
  return phase.phase === 'countdown' ? 0 : phase.elapsed;
}

/**
 * The sound for a change of display: a tick for each countdown second and for the last three
 * seconds of a target hold, "go" when the hold starts and "done" when a target hold ends.
 */
export function holdCue(previous: HoldPhase | null, current: HoldPhase): 'tick' | 'go' | 'done' | null {
  if (current.phase === 'countdown') {
    return !previous || previous.phase !== 'countdown' || previous.secondsLeft !== current.secondsLeft ? 'tick' : null;
  }
  if (current.phase === 'done') return previous?.phase === 'done' ? null : 'done';
  if (previous === null || previous.phase === 'countdown') return 'go';
  if (previous.phase === 'running' && current.remaining !== null && current.remaining <= 3 && current.remaining !== previous.remaining) return 'tick';
  return null;
}
