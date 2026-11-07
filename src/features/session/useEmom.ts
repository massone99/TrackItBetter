import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { EMOM_COUNTDOWN_SEC, emomCue, emomPhase, firstRoundStart, parseEmomPlan, roundEndsAt, roundsDue, type EmomPhase, type EmomPlan } from '../../domain/emom';
import { playBeep } from '../../shared/audio/beeps';
import { readPreference, writePreference } from '../../shared/settings/preferences';
import { countEmomRounds, recordEmomRound } from './repository';
import { cancelEmomNotifications, scheduleEmomNotifications } from './restNotifications';

const KEEP_AWAKE_TAG = 'emom';
const keyFor = (workoutId: string) => `workout.emom.${workoutId}`;

export function readEmomPlan(workoutId: string): EmomPlan | null {
  const plan = parseEmomPlan(readPreference(keyFor(workoutId)));
  return plan?.workoutId === workoutId ? plan : null;
}

/** Forgets the EMOM of a workout, e.g. when the workout is discarded. */
export function clearEmomPlan(workoutId: string): void {
  writePreference(keyFor(workoutId), '');
  void cancelEmomNotifications().catch(() => undefined);
}

export type EmomStart = Pick<EmomPlan, 'entryId' | 'intervalSec' | 'rounds' | 'target' | 'field'>;
export interface EmomAlertText { round: (round: number, rounds: number) => { title: string; body: string }; done: { title: string; body: string } }

/**
 * Runs one EMOM per workout. The plan is stored on the device and the rounds already recorded are read
 * back from the sets, so leaving the screen, locking the phone or closing the app never loses or doubles
 * a round: whatever time has passed is recorded on return, each round at its real end time.
 */
export function useEmom(workoutId: string | undefined, { onRecorded, onFinished, alerts }: {
  onRecorded: () => void;
  onFinished: (plan: EmomPlan) => void;
  alerts: EmomAlertText;
}) {
  const [plan, setPlan] = useState<EmomPlan | null>(() => (workoutId ? readEmomPlan(workoutId) : null));
  const [phase, setPhase] = useState<EmomPhase | null>(null);
  const planRef = useRef(plan);
  const previous = useRef<EmomPhase | null>(null);
  const syncing = useRef<Promise<void> | null>(null);
  const callbacks = useRef({ onRecorded, onFinished });
  useEffect(() => { callbacks.current = { onRecorded, onFinished }; });

  const save = useCallback((next: EmomPlan | null) => {
    planRef.current = next;
    setPlan(next);
    if (!workoutId) return;
    writePreference(keyFor(workoutId), next ? JSON.stringify(next) : '');
  }, [workoutId]);

  /** Records every round whose time is over and not in the sets yet; safe to call any number of times. */
  const sync = useCallback((): Promise<void> => {
    // Runs queue up instead of joining one in flight, so a caller always sees the state at its own time.
    const run = (syncing.current ?? Promise.resolve()).then(async () => {
      const current = planRef.current;
      if (!current) return;
      const due = roundsDue(current, Date.now());
      let recorded = await countEmomRounds(current.entryId, new Date(firstRoundStart(current)));
      let changed = false;
      while (recorded < due) {
        const round = recorded + 1;
        // Every round takes the value in the bar (read afresh, so a tap just before the minute counts), and that
        // value stays as the prefill of the next round: what the last round recorded, until it is changed by hand.
        const value = planRef.current?.value ?? current.value;
        await recordEmomRound(current.entryId, current.field, value, new Date(roundEndsAt(current, round)));
        recorded = round;
        changed = true;
      }
      if (changed) callbacks.current.onRecorded();
      // Compared with the live plan: a round added while this run was in flight keeps the EMOM going.
      const latest = planRef.current;
      if (latest && latest.startedAt === current.startedAt && due >= latest.rounds) {
        save(null);
        void cancelEmomNotifications().catch(() => undefined);
        callbacks.current.onFinished(current);
      }
    }).catch(() => {
      // A failed write (e.g. the workout was finished elsewhere) ends the EMOM instead of retrying forever.
      save(null);
    }).finally(() => { if (syncing.current === run) syncing.current = null; });
    syncing.current = run;
    return run;
  }, [save]);

  const active = plan !== null;
  useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    const tick = () => {
      const current = planRef.current;
      if (!current) return;
      const next = emomPhase(current, Date.now());
      const cue = emomCue(previous.current, next);
      if (cue && (previous.current !== null || next.phase !== 'done')) playBeep(cue);
      const roundChanged = previous.current?.phase === 'running' && (next.phase !== 'running' || next.round !== previous.current.round);
      previous.current = next;
      setPhase((shown) => (shown && JSON.stringify(shown) === JSON.stringify(next) ? shown : next));
      if (roundChanged || next.phase === 'done') void sync();
    };
    tick();
    void sync();
    const interval = setInterval(tick, 250);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
    return () => {
      clearInterval(interval);
      subscription.remove();
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [active, sync]);

  /** One alert per round change and one at the end; rounds already over are skipped by the scheduler. */
  const scheduleAlerts = useCallback((target: EmomPlan) => {
    const rounds = Array.from({ length: target.rounds }, (_, index) => index + 1);
    void scheduleEmomNotifications([
      ...rounds.slice(0, -1).map((round) => ({ at: roundEndsAt(target, round), ...alerts.round(round + 1, target.rounds) })),
      { at: roundEndsAt(target, target.rounds), ...alerts.done },
    ]).catch(() => undefined);
  }, [alerts]);

  const start = useCallback((config: EmomStart) => {
    if (!workoutId) return;
    const next: EmomPlan = { ...config, workoutId, startedAt: Date.now(), countdownSec: EMOM_COUNTDOWN_SEC, value: config.target };
    previous.current = null;
    setPhase(null);
    save(next);
    scheduleAlerts(next);
  }, [workoutId, save, scheduleAlerts]);

  /** Adds one round to the running EMOM (a set added by hand to its exercise); false once its last round is over. */
  const addRound = useCallback((): boolean => {
    const current = planRef.current;
    if (!current || roundsDue(current, Date.now()) >= current.rounds) return false;
    const next = { ...current, rounds: current.rounds + 1 };
    save(next);
    scheduleAlerts(next);
    return true;
  }, [save, scheduleAlerts]);

  /** Undoes `addRound`: takes the last round off while it has not started yet; false otherwise. */
  const removeRound = useCallback((): boolean => {
    const current = planRef.current;
    // The round running is roundsDue + 1: the last one can go only while a later round than that exists.
    if (!current || current.rounds <= 1 || roundsDue(current, Date.now()) + 1 >= current.rounds) return false;
    const next = { ...current, rounds: current.rounds - 1 };
    save(next);
    scheduleAlerts(next);
    return true;
  }, [save, scheduleAlerts]);

  /** Ends the EMOM: rounds already over are kept, the one in progress is dropped. */
  const stop = useCallback(async () => {
    await sync();
    save(null);
    setPhase(null);
    previous.current = null;
    void cancelEmomNotifications().catch(() => undefined);
  }, [sync, save]);

  const setValue = useCallback((value: number) => {
    const current = planRef.current;
    if (current) save({ ...current, value: Math.max(0, Math.round(value)) });
  }, [save]);

  return { plan, phase: plan ? phase : null, start, addRound, removeRound, stop, setValue, sync };
}
