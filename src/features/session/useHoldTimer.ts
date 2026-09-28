import { useCallback, useEffect, useRef, useState } from 'react';
import { holdCue, holdPhase, recordedSeconds, startHold, type HoldMode, type HoldPhase, type HoldTimer } from '../../domain/holdTimer';
import { playBeep } from '../../shared/audio/beeps';
import { readPreference, writePreference } from '../../shared/settings/preferences';

const MODE_KEY = 'workout.holdMode';

/** The hold mode used for a set nobody picked one for: the last one chosen on this device. */
export function defaultHoldMode(): HoldMode {
  return readPreference(MODE_KEY) === 'target' ? 'target' : 'free';
}

export function rememberHoldMode(mode: HoldMode): void {
  writePreference(MODE_KEY, mode);
}

export interface ActiveHold {
  setId: string;
  phase: HoldPhase;
  mode: HoldMode;
  targetSec: number;
}

/**
 * Runs one hold at a time: countdown with beeps, then the hold. A target hold that reaches its time
 * calls `onFinished` by itself; `stop` returns the seconds to record for a hold stopped by hand.
 */
export function useHoldTimer(onFinished: (setId: string, seconds: number) => void) {
  const [running, setRunning] = useState<{ setId: string; timer: HoldTimer } | null>(null);
  const [phase, setPhase] = useState<HoldPhase | null>(null);
  const previous = useRef<HoldPhase | null>(null);
  const finished = useRef(onFinished);
  useEffect(() => { finished.current = onFinished; });

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const current = holdPhase(running.timer, Date.now());
      const cue = holdCue(previous.current, current);
      previous.current = current;
      if (cue) playBeep(cue);
      setPhase(current);
      if (current.phase === 'done') {
        setRunning(null);
        finished.current(running.setId, current.elapsed);
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [running]);

  const start = useCallback((setId: string, mode: HoldMode, targetSec: number) => {
    previous.current = null;
    setRunning({ setId, timer: startHold(Date.now(), mode, targetSec) });
  }, []);

  /** Stops the hold and returns the seconds held (0 while still counting down). */
  const stop = useCallback((): number => {
    const seconds = running ? recordedSeconds(holdPhase(running.timer, Date.now())) : 0;
    setRunning(null);
    setPhase(null);
    return seconds;
  }, [running]);

  const active: ActiveHold | null = running && phase && phase.phase !== 'done'
    ? { setId: running.setId, phase, mode: running.timer.mode, targetSec: running.timer.targetSec }
    : null;
  return { active, start, stop };
}
