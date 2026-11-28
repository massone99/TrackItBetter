import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { blockEnd, blockStart, hasFinal, isRepsPlan, parseTimedCues, recoveryEnd, timedPhase, timedRounds, timedSoundCue, type TimedMethodCues, type TimedMethodPhase, type TimedMethodPlan } from '../../domain/timedMethod';
import { playBeep } from '../../shared/audio/beeps';
import { writePreference } from '../../shared/settings/preferences';
import { recordTimedMethod } from './repository';
import { readTimedConfig, readTimedPlan, rememberMaxReps, timedPlanKey, writeTimedConfig, type TimedMethodConfig } from './timedMethodPlan';

const KEEP_AWAKE_TAG = 'timed-method';

export type TimedStart = TimedMethodConfig & { entryId: string; exerciseId: string };

export function useTimedMethod(workoutId: string | undefined, callbacks: { onRecorded: () => void; onSaveError: () => void }) {
  const [plan, setPlan] = useState<TimedMethodPlan | null>(() => (workoutId ? readTimedPlan(workoutId) : null));
  const [phase, setPhase] = useState<TimedMethodPhase | null>(null);
  const planRef = useRef(plan);
  const previous = useRef<TimedMethodPhase | null>(null);
  const writing = useRef<Promise<void> | null>(null);
  const stopping = useRef<Promise<boolean> | null>(null);
  const savedRounds = useRef(0);
  const retryAt = useRef(0);
  const alertedRound = useRef(0);
  const stopFailed = useRef(false);
  const justStarted = useRef(false);
  const callbacksRef = useRef(callbacks);
  useEffect(() => { callbacksRef.current = callbacks; });

  const save = useCallback((next: TimedMethodPlan | null) => {
    planRef.current = next;
    setPlan(next);
    if (workoutId) writePreference(timedPlanKey(workoutId), next ? JSON.stringify(next) : '');
  }, [workoutId]);

  /** Stopping during a hold saves its measured duration. A failed save keeps the frozen plan for retry. */
  const stop = useCallback((): Promise<boolean> => {
    if (stopping.current) return stopping.current;
    const current = planRef.current;
    if (!current) return Promise.resolve(true);
    const stoppedAt = current.stoppedAt ?? current.testEndedAt ?? Date.now();
    save({ ...current, stoppedAt });
    const alreadyDone = previous.current?.phase === 'done';
    const pending = (async () => {
      try {
        await writing.current;
        await recordTimedMethod(current, stoppedAt, true);
        if (isRepsPlan(current) && current.exerciseId && current.testStartedAt !== null && (current.maxReps ?? 0) > 0) rememberMaxReps(current.exerciseId, current.maxReps!);
        const resolvedCues = parseTimedCues(current.cues);
        if (resolvedCues.milestones && resolvedCues.milestoneTone && resolvedCues.milestoneTone !== 'none' && !alreadyDone) {
          playBeep(resolvedCues.milestoneTone, { volume: resolvedCues.volume, vibrate: resolvedCues.vibrate });
        }
        save(null);
        setPhase(null);
        previous.current = null;
        callbacksRef.current.onRecorded();
        return true;
      } catch {
        stopFailed.current = true;
        callbacksRef.current.onSaveError();
        return false;
      } finally {
        stopping.current = null;
      }
    })();
    stopping.current = pending;
    return pending;
  }, [save]);

  const active = plan !== null;
  useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    const tick = () => {
      const current = planRef.current;
      if (!current) return;
      const now = Date.now();
      if (current.stoppedAt !== undefined || current.testEndedAt !== null) {
        setPhase((shown) => shown?.phase === 'done' ? shown : { phase: 'done', seconds: 0 });
        if (!stopFailed.current) void stop();
        return;
      }
      const next = timedPhase(current, now);
      const resolvedCues = parseTimedCues(current.cues);
      const cue = timedSoundCue(previous.current, next, resolvedCues, { holdSec: current.holdSec, testSec: current.testSec });
      if (cue && (previous.current || justStarted.current)) {
        playBeep(cue, { volume: resolvedCues.volume, vibrate: resolvedCues.vibrate });
      }
      justStarted.current = false;
      previous.current = next;
      setPhase((shown) => (shown && JSON.stringify(shown) === JSON.stringify(next) ? shown : next));
      if (!hasFinal(current) && now >= blockEnd(current)) {
        void stop();
        return;
      }
      if (current.blockSaved || writing.current) return;
      const cycleMs = (current.holdSec + current.restSec) * 1000;
      const rounds = Math.min(timedRounds(current), Math.floor((now - blockStart(current)) / cycleMs));
      if (rounds <= savedRounds.current || now < retryAt.current) return;
      writing.current = recordTimedMethod(current, blockStart(current) + rounds * cycleMs, false)
        .then(() => {
          savedRounds.current = rounds;
          callbacksRef.current.onRecorded();
        })
        .catch(() => {
          retryAt.current = Date.now() + 5000;
          if (alertedRound.current === rounds) return;
          alertedRound.current = rounds;
          callbacksRef.current.onSaveError();
        })
        .finally(() => { writing.current = null; });
    };
    tick();
    const interval = setInterval(tick, 250);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    return () => {
      clearInterval(interval);
      subscription.remove();
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [active, stop]);

  const start = useCallback((config: TimedStart) => {
    if (!workoutId || planRef.current) return;
    const { entryId, exerciseId, lastMaxReps, ...settings } = config;
    writeTimedConfig(exerciseId, { ...settings, lastMaxReps });
    previous.current = null;
    justStarted.current = true;
    savedRounds.current = 0;
    retryAt.current = 0;
    alertedRound.current = 0;
    stopFailed.current = false;
    setPhase(null);
    const reps = settings.kind === 'reps'
      ? { kind: 'reps' as const, exerciseId, testSec: 0, repsPerRound: settings.repsPerRound ?? 1, maxSet: settings.maxSet === true, maxReps: lastMaxReps ?? settings.repsPerRound ?? 1, roundReps: {} }
      : { exerciseId };
    save({ ...settings, ...reps, workoutId, entryId, startedAt: Date.now(), recoveryEndedAt: null, testStartedAt: null, testEndedAt: null, blockSaved: false });
  }, [workoutId, save]);

  /** Updates custom audio cues live while the timed method is running and persists them for this exercise. */
  const updateCues = useCallback((nextCues: TimedMethodCues) => {
    const current = planRef.current;
    if (!current || current.stoppedAt !== undefined) return;
    const cues = parseTimedCues(nextCues);
    save({ ...current, cues });
    if (current.exerciseId) {
      const kind = isRepsPlan(current) ? 'reps' : 'hold';
      const existing = readTimedConfig(current.exerciseId, kind);
      writeTimedConfig(current.exerciseId, { ...existing, cues });
    }
  }, [save]);

  const skipRecovery = useCallback(() => {
    const current = planRef.current;
    const now = Date.now();
    if (current && current.stoppedAt === undefined && timedPhase(current, now).phase === 'recovery') {
      save({ ...current, recoveryEndedAt: now });
    }
  }, [save]);

  const startTest = useCallback(() => {
    const current = planRef.current;
    const now = Date.now();
    if (current && current.stoppedAt === undefined && hasFinal(current) && current.testStartedAt === null && now >= recoveryEnd(current)) {
      save({ ...current, testStartedAt: now + current.countdownSec * 1000 });
    }
  }, [save]);

  /** Reps plans: corrects the reps of a round not yet saved (later ones are edited in the workout). */
  const setRoundReps = useCallback((round: number, reps: number) => {
    const current = planRef.current;
    if (!current || current.stoppedAt !== undefined || !isRepsPlan(current) || round <= savedRounds.current) return;
    save({ ...current, roundReps: { ...current.roundReps, [String(round)]: Math.max(0, Math.round(reps)) } });
  }, [save]);

  /** Reps plans: the reps counted during the max set. */
  const setMaxReps = useCallback((reps: number) => {
    const current = planRef.current;
    if (!current || current.stoppedAt !== undefined || !isRepsPlan(current)) return;
    save({ ...current, maxReps: Math.max(0, Math.round(reps)) });
  }, [save]);

  return { plan, phase: plan ? phase : null, start, skipRecovery, startTest, finishTest: stop, stop, setRoundReps, setMaxReps, updateCues };
}
