import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { blockEnd, blockHoldSec, TIMED_COUNTDOWN_SEC, timedCue, timedLabel, timedPhase, type TimedMethodPhase, type TimedMethodPlan } from '../../domain/timedMethod';
import { playBeep } from '../../shared/audio/beeps';
import { writePreference } from '../../shared/settings/preferences';
import { recordEmomRound } from './repository';
import { clearTimedPlan, readTimedPlan, timedPlanKey, writeTimedConfig, type TimedMethodConfig } from './timedMethodPlan';

const KEEP_AWAKE_TAG = 'timed-method';
export { clearTimedPlan, readTimedPlan };

export type TimedStart = TimedMethodConfig & { entryId: string; exerciseId: string };

/**
 * Runs one timed method per workout. The plan is kept on the device and every phase is read from timestamps, so
 * leaving the screen or locking the phone loses nothing. The block is saved as one set when it ends, and the
 * final hold as another when it is ended; the app saves whatever was done if the method is stopped early.
 */
export function useTimedMethod(workoutId: string | undefined, { onRecorded }: { onRecorded: () => void }) {
  const [plan, setPlan] = useState<TimedMethodPlan | null>(() => (workoutId ? readTimedPlan(workoutId) : null));
  const [phase, setPhase] = useState<TimedMethodPhase | null>(null);
  const planRef = useRef(plan);
  const previous = useRef<TimedMethodPhase | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => { onRecordedRef.current = onRecorded; });

  const save = useCallback((next: TimedMethodPlan | null) => {
    planRef.current = next;
    setPlan(next);
    if (workoutId) writePreference(timedPlanKey(workoutId), next ? JSON.stringify(next) : '');
  }, [workoutId]);

  /** Saves the block's set once its time is over; the plan remembers it so it is never saved twice. */
  const saveBlock = useCallback((current: TimedMethodPlan) => {
    if (current.blockSaved) return;
    const next = { ...current, blockSaved: true };
    save(next);
    saving.current = saving.current
      .then(() => recordEmomRound(current.entryId, 'durationSec', blockHoldSec(current), new Date(blockEnd(current)), timedLabel(current)))
      .then(() => onRecordedRef.current())
      .catch(() => undefined);
  }, [save]);

  const stopRef = useRef<() => Promise<void>>(async () => undefined);
  const active = plan !== null;
  useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    const tick = () => {
      const current = planRef.current;
      if (!current) return;
      const now = Date.now();
      const next = timedPhase(current, now);
      const cue = timedCue(previous.current, next);
      if (cue && previous.current !== null) playBeep(cue);
      previous.current = next;
      setPhase((shown) => (shown && JSON.stringify(shown) === JSON.stringify(next) ? shown : next));
      if (now >= blockEnd(current)) {
        saveBlock(current);
        // No final hold planned: the method ends with the block.
        if (current.testSec === 0) void stopRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    return () => {
      clearInterval(interval);
      subscription.remove();
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [active, saveBlock]);

  const start = useCallback((config: TimedStart) => {
    if (!workoutId) return;
    const { entryId, exerciseId, ...settings } = config;
    writeTimedConfig(exerciseId, settings);
    previous.current = null;
    setPhase(null);
    save({ ...settings, workoutId, entryId, startedAt: Date.now(), countdownSec: TIMED_COUNTDOWN_SEC, recoveryEndedAt: null, testStartedAt: null, testEndedAt: null, blockSaved: false });
  }, [workoutId, save]);

  /** Cuts the recovery short and goes to "ready". */
  const skipRecovery = useCallback(() => {
    const current = planRef.current;
    if (current && current.recoveryEndedAt === null && Date.now() < blockEnd(current) + current.recoverySec * 1000) save({ ...current, recoveryEndedAt: Math.max(Date.now(), blockEnd(current)) });
  }, [save]);

  /** Starts the final hold after a short countdown. */
  const startTest = useCallback(() => {
    const current = planRef.current;
    if (current && current.testStartedAt === null) save({ ...current, testStartedAt: Date.now() + TIMED_COUNTDOWN_SEC * 1000 });
  }, [save]);

  /** Ends the final hold, saves it with the seconds held and closes the method. */
  const finishTest = useCallback(async () => {
    const current = planRef.current;
    if (!current || current.testStartedAt === null || current.testEndedAt !== null) return;
    const now = Date.now();
    const held = Math.max(0, Math.round((now - current.testStartedAt) / 1000));
    save({ ...current, testEndedAt: now });
    await saving.current;
    // A hold ended during its countdown is not a hold: nothing to save.
    if (held > 0) await recordEmomRound(current.entryId, 'durationSec', held, new Date(now), `${timedLabel(current)} · ${current.testSec}″`).catch(() => undefined);
    onRecordedRef.current();
    save(null);
    setPhase(null);
    previous.current = null;
  }, [save]);

  /** Closes the method; the block is kept if it was over, the one in progress is dropped. */
  const stop = useCallback(async () => {
    const current = planRef.current;
    if (current && Date.now() >= blockEnd(current)) saveBlock(current);
    await saving.current;
    save(null);
    setPhase(null);
    previous.current = null;
  }, [save, saveBlock]);

  useEffect(() => { stopRef.current = stop; });

  return { plan, phase: plan ? phase : null, start, skipRecovery, startTest, finishTest, stop };
}
