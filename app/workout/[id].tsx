import { displayWorkoutName } from '../../src/features/session/workoutName';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eq } from 'drizzle-orm';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { groupSets, completedSetCount } from '../../src/domain/setPairs';
import { poseDetectionAvailable } from '../../src/features/pose/detectPose';
import { ExercisePicker, type ExerciseChoice } from '../../src/features/exercises/ExercisePicker';
import { ReferenceLinkSheet } from '../../src/features/exercises/ReferenceLinkSheet';
import { db, initializeDatabase } from '../../src/db/client';
import { settings as preferenceSettings } from '../../src/db/schema';
import { cancelRestFinishedNotification, scheduleRestFinishedNotification } from '../../src/features/session/restNotifications';
import { restForSet } from '../../src/features/session/restDefaults';
import { supersetStep } from '../../src/features/session/superset';
import { SupersetFields } from '../../src/features/session/SupersetFields';
import type { ScrollHandle } from '../../src/shared/components/keyboard';
import { getSessionRecords } from '../../src/features/analytics/repository';
import type { RecordKind } from '../../src/features/analytics/records';
import { ExerciseRestFields } from '../../src/features/session/ExerciseRestFields';
import {
  updateEntryNote,
  addExerciseToWorkout,
  enableExerciseLoad,
  setSetFormRating,
  addSet,
  completeSet,
  copyValuesToSet,
  replaceEntryExercise,
  deleteWorkout,
  finishWorkout,
  IncompletePairError,
  moveExerciseEntry,
  getActiveWorkout,
  getPreviousPerformance,
  removeExerciseEntry,
  removeExerciseEntryWithUndo,
  removeSetWithUndo,
  restoreRemoved,
  uncompleteSet,
  updateSetNote,
  setSetKind,
  addWarmupSet,
  updateSetRpe,
  updateWorkoutReadiness,
  updateSet,
} from '../../src/features/session/repository';
import type { ActiveWorkout, PreviousPerformance, PreviousSetValues, RemovedRows, SessionExercise, SessionSet } from '../../src/features/session/repository';
import { defaultHoldMode, rememberHoldMode, useHoldTimer, type ActiveHold } from '../../src/features/session/useHoldTimer';
import { exerciseFinished, nextFolded } from '../../src/domain/folding';
import { adjustedRest, REST_STEP_SEC } from '../../src/domain/restTimer';
import { ExerciseBlockField } from '../../src/features/session/ExerciseBlockField';
import { blockOf, usesBlocks, type Block } from '../../src/domain/blocks';
import { clearEmomPlan, useEmom, type EmomAlertText } from '../../src/features/session/useEmom';
import { EmomSetupSheet, emomFieldFor } from '../../src/features/session/EmomSetupSheet';
import { emomLabel, type EmomPhase, type EmomPlan } from '../../src/domain/emom';
import type { HoldMode } from '../../src/domain/holdTimer';
import { playBeep } from '../../src/shared/audio/beeps';
import {
  ActionButton,
  Body,
  Card,
  Chip,
  EmptyState,
  FooterAction,
  Icon,
  Label,
  PageHeading,
  ProgressMeter,
  Screen,
  SegmentedControl,
  Sheet,
  Text,
  TextField,
  Toast,
  tapFeedback,
} from '../../src/shared/components/ui';
import { ReorderableList } from '../../src/shared/components/ReorderableList';
import { RpePicker } from '../../src/features/session/RpePicker';
import { SaveToProgramSheet } from '../../src/features/programs/SaveToProgramSheet';
import { ExerciseNoteField } from '../../src/features/session/ExerciseNoteField';
import { FormRating } from '../../src/features/session/LastTime';
import { describePreviousSet, ExerciseCard, holdDisplay } from '../../src/features/session/ExerciseCard';
import Animated, { FadeInDown, FadeOutLeft, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import { readBooleanPreference, RPE_PROMPT_KEY, writePreference } from '../../src/shared/settings/preferences';

import { MIN_TOUCH_TARGET } from '../../src/shared/theme/tokens';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { formatClock, formatNumber } from '../../src/shared/utils/format';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { useAnimationSettings } from '../../src/shared/settings/AnimationProvider';

const VOICE_CUES_KEY = 'workout.voice_cues.enabled';
/** Pause between finishing an exercise and folding it. */
const FOLD_DELAY_MS = 650;

/** Taps on the same set's done button closer than this are one tap. */
const DOUBLE_TAP_MS = 500;

/** Set once the first set has been swiped, which hides the gesture hint. */
const SWIPE_HINT_KEY = 'workout.swipeHintSeen';

export default function WorkoutScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { duration } = useAnimationSettings();
  const exerciseEntering = duration(260) ? FadeInDown.duration(duration(260)) : undefined;
  const itemExiting = duration(200) ? FadeOutLeft.duration(duration(200)) : undefined;
  const rowLayout = duration(240) ? LinearTransition.duration(duration(240)) : undefined;
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const workoutRef = useRef<ActiveWorkout | null>(null);
  useEffect(() => { workoutRef.current = workout; }, [workout]);
  const [collapsedEntries, setCollapsedEntries] = useState<ReadonlyMap<string, boolean>>(new Map());
  const completionState = useRef<ReadonlyMap<string, boolean>>(new Map());
  const loadedOnce = useRef(false);
  const [previous, setPrevious] = useState<Map<string, PreviousPerformance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Entry whose exercise is being replaced; null when the picker adds an exercise instead.
  const [replacing, setReplacing] = useState<SessionExercise | null>(null);
  // A rest keeps running when the screen is left: its end time lives outside the component.
  const [restSeconds, setRestSeconds] = useState<number | null>(() => {
    const endsAt = id ? runningRests.get(id) : undefined;
    return endsAt && endsAt > Date.now() ? Math.ceil((endsAt - Date.now()) / 1000) : null;
  });
  const [restEndsAt, setRestEndsAt] = useState<number | null>(() => {
    const endsAt = id ? runningRests.get(id) : undefined;
    return endsAt && endsAt > Date.now() ? endsAt : null;
  });
  // Hold mode chosen per set during this session; unset sets use the last mode picked.
  const [holdModes, setHoldModes] = useState<Map<string, HoldMode>>(new Map());
  const holdModeFor = (setId: string) => holdModes.get(setId) ?? defaultHoldMode();
  // The last removal, offered for a few seconds as "Restore".
  const [undo, setUndo] = useState<{ message: string; removed: RemovedRows } | null>(null);
  const hideUndo = useCallback(() => setUndo(null), []);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [voiceCues, setVoiceCues] = useState(false);
  const [voicePreferenceLoaded, setVoicePreferenceLoaded] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedTo, setSavedTo] = useState<{ id: string; name: string } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [optionsFor, setOptionsFor] = useState<SessionExercise | null>(null);
  const [emomSetupFor, setEmomSetupFor] = useState<SessionExercise | null>(null);
  const [emomNotice, setEmomNotice] = useState<string | null>(null);
  // PRs set so far in this workout: record kinds per set, and exercises with a volume mini PR.
  const recordCount = useRef<number | null>(null);
  const [records, setRecords] = useState<{ sets: Map<string, RecordKind[]>; volume: Set<string> }>(() => ({ sets: new Map(), volume: new Set() }));
  const [referenceFor, setReferenceFor] = useState<SessionExercise | null>(null);
  const [removeExerciseFor, setRemoveExerciseFor] = useState<SessionExercise | null>(null);
  const [setSheet, setSetSheet] = useState<{ exercise: SessionExercise; setId: string } | null>(null);
  // Set that just got completed and is waiting for an optional RPE tap.
  // RPE chips under every working set; Profile can hide them.
  const [showRpe] = useState(() => readBooleanPreference(RPE_PROMPT_KEY, true));
  const [loadNotice, setLoadNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await initializeDatabase();
      const row = await db.select({ value: preferenceSettings.value })
        .from(preferenceSettings)
        .where(eq(preferenceSettings.key, VOICE_CUES_KEY))
        .get();
      if (mounted) {
        setVoiceCues(row?.value === 'true');
        setVoicePreferenceLoaded(true);
      }
    })().catch(() => {
      if (mounted) setVoicePreferenceLoaded(true);
    });
    return () => { mounted = false; };
  }, []);

  const previousKey = useRef<string | null>(null);
  const refresh = useCallback(async (workoutId: string) => {
    const next = await getActiveWorkout(workoutId);
    setWorkout(next);
    if (!next) return;
    const before = completionState.current;
    const completed = new Map(next.exercises.map((exercise) => [exercise.entryId, exerciseFinished(exercise.sets)] as const));
    const initial = !loadedOnce.current;
    loadedOnce.current = true;
    // Exercises start folded; see nextFolded for what keeps or changes that. One that has just been
    // finished folds after a short pause, so it does not vanish under the finger that rated its last set.
    const justFinished = initial ? [] : [...completed].filter(([entryId, done]) => done && before.get(entryId) === false).map(([entryId]) => entryId);
    setCollapsedEntries((current) => {
      const folded = nextFolded(completed, before, current, initial);
      for (const entryId of justFinished) folded.set(entryId, current.get(entryId) ?? false);
      return folded;
    });
    completionState.current = completed;
    if (justFinished.length > 0) {
      setTimeout(() => setCollapsedEntries((current) => {
        const ready = justFinished.filter((entryId) => completionState.current.get(entryId) && !current.get(entryId));
        return ready.length === 0 ? current : new Map([...current, ...ready.map((entryId) => [entryId, true] as const)]);
      }), FOLD_DELAY_MS);
    }
    // "Last time" only changes when the exercises change, so it is not re-read after every set.
    const exerciseKey = `${next.id}:${next.exercises.map((exercise) => exercise.exerciseId).join(',')}`;
    const [previousPerformance, found] = await Promise.all([
      previousKey.current === exerciseKey ? null : getPreviousPerformance(next.exercises.map((exercise) => exercise.exerciseId), next.id),
      getSessionRecords(next.id).catch(() => null),
    ]);
    if (previousPerformance) { previousKey.current = exerciseKey; setPrevious(previousPerformance); }
    if (!found) return;
    const bySet = new Map<string, RecordKind[]>();
    for (const record of found.sets) bySet.set(record.setId, [...(bySet.get(record.setId) ?? []), record.kind]);
    const count = bySet.size + found.volume.length;
    // Celebrate a new record, but not the ones already there when the workout is reopened.
    if (recordCount.current !== null && count > recordCount.current) tapFeedback('success');
    recordCount.current = count;
    setRecords({ sets: bySet, volume: new Set(found.volume.map((record) => record.exerciseId)) });
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (id === 'new') {
        const { startWorkout } = await import('../../src/features/session/repository');
        const newId = await startWorkout();
        if (mounted) router.replace({ pathname: '/workout/[id]', params: { id: newId } });
        return;
      }
      await refresh(id);
      if (mounted) setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, [id, refresh]);

  const emomAlerts = useMemo<EmomAlertText>(() => ({
    round: (round, rounds) => ({ title: t('emom.notifyTitle'), body: t('emom.notifyRound', { round, rounds }) }),
    done: { title: t('emom.notifyTitle'), body: t('emom.notifyDone') },
  }), [t]);
  const emom = useEmom(id && id !== 'new' ? id : undefined, {
    alerts: emomAlerts,
    onRecorded: () => { if (id) void refresh(id); },
    onFinished: (plan: EmomPlan) => {
      // The sets carry the numbers; the note keeps the format they were done in.
      const exercise = workoutRef.current?.exercises.find((item) => item.entryId === plan.entryId);
      const label = emomLabel(plan);
      if (exercise && !(exercise.notes ?? '').includes(label)) {
        void updateEntryNote(plan.entryId, exercise.notes ? `${exercise.notes}\n${label}` : label).then(() => { if (id) void refresh(id); }).catch(() => undefined);
      }
      setEmomNotice(t('emom.finished', { count: plan.rounds }));
    },
  });
  const emomEntryId = emom.plan?.entryId ?? null;

  // Returning from the form-check or new-exercise screens brings back clips and exercises added there.
  // The first focus is the mount, which the effect above already loads.
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    if (id && id !== 'new') void refresh(id);
  }, [id, refresh]));

  const isResting = restEndsAt !== null;
  useEffect(() => {
    if (!isResting) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((restEndsAt ?? Date.now()) - Date.now()) / 1000));
      if (remaining === 0) {
        setRestSeconds(null);
        setRestEndsAt(null);
        if (id) runningRests.delete(id);
        playBeep('done');
        return;
      }
      if (voiceCues && (remaining === 10 || remaining === 3 || remaining === 2 || remaining === 1)) {
        const language = i18n.resolvedLanguage === 'it' ? 'it-IT' : 'en-US';
        const prompt = remaining === 1 ? t('workout.restLastSecond') : String(remaining);
        Speech.speak(prompt, { language, rate: 0.95 });
      }
      setRestSeconds(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [isResting, restEndsAt, id, voiceCues, i18n.resolvedLanguage, t]);

  const toggleVoiceCues = async () => {
    const enabled = !voiceCues;
    setVoiceCues(enabled);
    try {
      await initializeDatabase();
      await db.insert(preferenceSettings)
        .values({ key: VOICE_CUES_KEY, value: String(enabled) })
        .onConflictDoUpdate({ target: preferenceSettings.key, set: { value: String(enabled) } });
      if (!enabled) void Speech.stop();
    } catch {
      setVoiceCues(!enabled);
    }
  };

  useEffect(() => {
    const updateClock = () => setClockNow(Date.now());
    updateClock();
    const timer = setInterval(updateClock, 15_000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = useMemo(() => {
    if (!workout || clockNow === null) return '';
    const minutes = Math.max(0, Math.floor((clockNow - workout.startedAt.getTime()) / 60_000));
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }, [workout, clockNow]);

  const supersetLetters = new Map<string, string>();
  for (const exercise of workout?.exercises ?? []) {
    if (exercise.groupId && !supersetLetters.has(exercise.groupId)) supersetLetters.set(exercise.groupId, String.fromCharCode(65 + supersetLetters.size));
  }

  const completedCount = workout?.exercises.reduce((total, exercise) => total + completedSetCount(exercise.sets), 0) ?? 0;

  const saveReadiness = async (field: 'sleep' | 'energy' | 'soreness', value: number) => {
    if (!workout) return;
    await updateWorkoutReadiness(workout.id, field, value);
    await refresh(workout.id);
  };

  const startRestTimer = (seconds: number) => {
    const duration = Math.max(1, Math.floor(seconds));
    const endsAt = Date.now() + duration * 1000;
    setRestSeconds(duration);
    setRestEndsAt(endsAt);
    if (id) runningRests.set(id, endsAt);
    void scheduleRestFinishedNotification(duration, {
      title: t('workout.restDoneTitle'), body: t('workout.restDoneBody'), countdown: t('workout.restCountdown'), channel: t('workout.restChannel'),
    }).catch(() => undefined);
  };

  /** Moves the end of the running rest by a step; taking off more than is left ends it. */
  const adjustRest = (deltaSec: number) => {
    if (restEndsAt === null) return;
    const remaining = adjustedRest(restEndsAt, nowMs(), deltaSec);
    if (remaining === null) { skipRest(); return; }
    void cancelRestFinishedNotification().catch(() => undefined);
    startRestTimer(remaining);
  };

  const skipRest = () => {
    setRestSeconds(null);
    setRestEndsAt(null);
    if (id) runningRests.delete(id);
    void cancelRestFinishedNotification().catch(() => undefined);
  };

  /** Shows a change to a set at once; the write and the reload follow. */
  const patchSet = (setId: string, patch: Partial<SessionSet>) => setWorkout((current) => current && {
    ...current,
    exercises: current.exercises.map((exercise) => exercise.sets.some((set) => set.id === setId)
      ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)) }
      : exercise),
  });

  // A held stepper repeats faster than a save and reload: each step builds on the last value shown,
  // saves in order, and the screen reloads once the steps stop.
  const stepped = useRef(new Map<string, number>());
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeSet = async (
    set: SessionSet,
    field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg',
    delta: number,
  ) => {
    const key = `${set.id}:${field}`;
    const stored = field === 'addedLoadKg' ? set.addedLoadKg : set[field] ?? 0;
    const next = Number(((stepped.current.get(key) ?? stored) + delta).toFixed(2));
    const value = field === 'addedLoadKg' ? next : Math.max(0, next);
    stepped.current.set(key, value);
    patchSet(set.id, { [field]: value });
    if (field === 'addedLoadKg' && value !== 0) {
      const exercise = workout?.exercises.find((item) => item.sets.some((s) => s.id === set.id));
      if (exercise && exercise.metric !== 'reps_load' && exercise.metric !== 'time_load') await allowLoad(exercise);
    }
    writes.current = writes.current.then(() => updateSet(set.id, field, value)).catch(() => undefined);
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      void writes.current.then(async () => {
        stepped.current.clear();
        if (workout) await refresh(workout.id);
      });
    }, 350);
  };

  const allowLoad = async (exercise: SessionExercise) => {
    if (await enableExerciseLoad(exercise.exerciseId)) setLoadNotice(t('logger.loadEnabled', { name: exercise.name }));
  };

  const chooseExercise = async (exercise: ExerciseChoice) => {
    if (!workout) return;
    if (replacing) {
      if (exercise.id !== replacing.exerciseId) await replaceEntryExercise(replacing.entryId, exercise.id);
      setReplacing(null);
    } else {
      await addExerciseToWorkout(workout.id, exercise.id);
    }
    setPickerOpen(false);
    await refresh(workout.id);
  };

  /** Rest after a set: its own, else the exercise's rest for warm-ups or working sets. */
  const restAfter = (setId: string) => {
    const exercise = workout?.exercises.find((item) => item.sets.some((set) => set.id === setId));
    const set = exercise?.sets.find((item) => item.id === setId);
    return exercise && set ? restForSet(exercise.exerciseId, set) : 90;
  };

  const toggleWarmup = async (set: SessionSet) => {
    tapFeedback();
    await setSetKind(set.id, set.kind === 'warmup' ? 'working' : 'warmup');
    if (workout) await refresh(workout.id);
  };

  const scrollRef = useRef<ScrollHandle>(null);
  const cardTops = useRef(new Map<string, number>());
  const listTop = useRef(0);

  /**
   * Starts the right rest after a set and, in a superset, scrolls to the exercise that comes next:
   * no rest (or the short one) between exercises, the full rest at the end of the round.
   */
  const afterSetDone = (setId: string) => {
    const exercise = workout?.exercises.find((item) => item.sets.some((set) => set.id === setId));
    // While an EMOM runs its clock is the rest: no rest timer on top of it.
    if (emomEntryId) return;
    const marked = workout?.exercises.map((item) => ({ ...item, sets: item.sets.map((set) => set.id === setId ? { ...set, completedAt: new Date() } : set) })) ?? [];
    const finished = exercise?.sets.find((s) => s.id === setId);
    if (finished?.pairId && exercise?.sets.some((s) => s.pairId === finished.pairId && s.id !== setId && !s.completedAt)) {
      if (exercise.unilateralRestMode === 'side') startRestTimer(restAfter(setId));
      else skipRest();
      return;
    }
    const step = exercise ? supersetStep(marked, exercise.entryId) : null;
    if (!step || step.endOfRound) startRestTimer(restAfter(setId));
    else if (step.mode === 'between' && step.betweenSec > 0) startRestTimer(step.betweenSec);
    else skipRest();
    const top = step?.nextEntryId && step.nextEntryId !== exercise?.entryId ? cardTops.current.get(step.nextEntryId) : undefined;
    if (top !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, top - 16), animated: true });
  };


  // Sets whose done state is being saved, and when each last changed: a second tap while saving, or a
  // double tap, would otherwise undo the first one.
  const settling = useRef(new Set<string>());
  const lastToggle = useRef(new Map<string, number>());
  const settle = async (setId: string, work: () => Promise<void>) => {
    const now = Date.now();
    if (settling.current.has(setId) || now - (lastToggle.current.get(setId) ?? 0) < DOUBLE_TAP_MS) return;
    settling.current.add(setId);
    lastToggle.current.set(setId, now);
    try {
      await work();
    } finally {
      settling.current.delete(setId);
    }
    if (workout) await refresh(workout.id);
  };

  const completeRegularSet = (set: SessionSet) => settle(set.id, async () => {
    tapFeedback('success');
    patchSet(set.id, { completedAt: new Date() });
    await completeSet(set.id);
    afterSetDone(set.id);
  });

  /** Reopens a set; when it was the last one done, the rest it started stops too. */
  const reopenSet = (set: SessionSet) => settle(set.id, async () => {
    tapFeedback();
    const latest = workout?.exercises.flatMap((exercise) => exercise.sets).reduce<SessionSet | null>(
      (last, item) => (item.completedAt && (!last?.completedAt || item.completedAt > last.completedAt) ? item : last), null);
    patchSet(set.id, { completedAt: null });
    if (latest?.id === set.id) skipRest();
    await uncompleteSet(set.id);
  });

  const saveRpe = async (set: SessionSet, rpe: number | null) => {
    patchSet(set.id, { rpe });
    await updateSetRpe(set.id, rpe);
    if (workout) await refresh(workout.id);
  };

  const saveFormRating = async (set: SessionSet, rating: number | null) => {
    tapFeedback();
    patchSet(set.id, { formRating: rating });
    await setSetFormRating(set.id, rating);
    if (workout) await refresh(workout.id);
  };

  /** Saves a finished hold as the set's time, completes it and starts the rest. */
  const recordHold = async (setId: string, seconds: number) => {
    tapFeedback('success');
    await updateSet(setId, 'durationSec', seconds);
    await completeSet(setId);
    afterSetDone(setId);
    if (workout) await refresh(workout.id);
  };

  // A target hold that reaches its time records itself.
  const hold = useHoldTimer((setId, seconds) => void recordHold(setId, seconds));

  /** Stop pressed: during the countdown this cancels, afterwards it records the time held. */
  const finishCurrentHold = async () => {
    const active = hold.active;
    const seconds = hold.stop();
    if (!active || seconds === 0) return;
    await recordHold(active.setId, seconds);
  };

  /** Completes a set with its entered value; for holds this skips the timer (a running one is dropped). */
  const completeHoldManually = async (set: SessionSet) => {
    if (hold.active?.setId === set.id) hold.stop();
    await completeRegularSet(set);
  };

  const startHoldFor = (set: SessionSet) => {
    if (hold.active || emom.plan) return;
    skipRest();
    hold.start(set.id, holdModeFor(set.id), set.durationSec ?? 30);
  };

  const [swipeHint, setSwipeHint] = useState(() => !readBooleanPreference(SWIPE_HINT_KEY, false));
  const markSwiped = () => {
    if (!swipeHint) return;
    setSwipeHint(false);
    writePreference(SWIPE_HINT_KEY, 'true');
  };

  const offerUndo = (message: string, removed: RemovedRows | null) => {
    if (removed) setUndo({ message, removed });
  };

  /** Swiped away: removed at once with "Restore", except a set with clips, which asks in its sheet. */
  const removeSetFromRow = async (exercise: SessionExercise, set: SessionSet) => {
    if (!workout) return;
    // A recorded round of a running EMOM stays: removing it would let the clock record that round again.
    if (set.completedAt && exercise.entryId === emomEntryId) return;
    if (set.clipCount > 0) { setSetSheet({ exercise, setId: set.id }); return; }
    if (hold.active?.setId === set.id) hold.stop();
    offerUndo(t('logger.removedSet', { number: set.index }), await removeSetWithUndo(set.id));
    await refresh(workout.id);
  };

  const confirmFinish = async () => {
    if (!workout) return;
    setFinishOpen(false);
    void Speech.stop();
    void cancelRestFinishedNotification().catch(() => undefined);
    if (emom.plan) await emom.stop();
    try { await finishWorkout(workout.id); }
    catch (error) {
      if (error instanceof IncompletePairError) {
        Alert.alert(t('logger.pairIncompleteTitle'), t('logger.pairIncompleteBody', { name: error.exerciseName, number: error.setIndex, side: t(error.side === 'left' ? 'logger.sideLeft' : 'logger.sideRight') }));
      } else Alert.alert(t('history.saveError'), error instanceof Error ? error.message : String(error));
      return;
    }
    router.replace({ pathname: '/workout/summary/[id]', params: { id: workout.id } });
  };

  const confirmDiscard = async () => {
    if (!workout) return;
    setDiscardOpen(false);
    hold.stop();
    skipRest();
    void Speech.stop();
    clearEmomPlan(workout.id);
    await deleteWorkout(workout.id);
    router.replace('/(tabs)/today');
  };

  const removeExercise = async (exercise: SessionExercise) => {
    setRemoveExerciseFor(null);
    if (!workout) return;
    if (exercise.entryId === emomEntryId) await emom.stop();
    await removeExerciseEntry(exercise.entryId);
    await refresh(workout.id);
  };

  /** Without clips a removal can be undone, so it happens at once with a "Restore" toast. */
  const removeExerciseOrConfirm = async (exercise: SessionExercise) => {
    setOptionsFor(null);
    if (!workout) return;
    if (exercise.sets.some((set) => set.clipCount > 0)) { setRemoveExerciseFor(exercise); return; }
    if (exercise.entryId === emomEntryId) await emom.stop();
    offerUndo(t('logger.removedExercise', { name: exercise.name }), await removeExerciseEntryWithUndo(exercise.entryId));
    await refresh(workout.id);
  };

  const createExercise = (name: string) => {
    if (!workout) return;
    setPickerOpen(false);
    router.push({ pathname: '/exercise/new', params: { addTo: workout.id, ...(replacing ? { replaceEntry: replacing.entryId } : {}), ...(name ? { name } : {}) } });
    setReplacing(null);
  };

  const sheetExercise = setSheet ? workout?.exercises.find((item) => item.entryId === setSheet.exercise.entryId) : undefined;
  const sheetSet = sheetExercise?.sets.find((item) => item.id === setSheet?.setId);

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!workout) return <Screen><PageHeading title={t('workout.unavailable')} subtitle={t('workout.finished')} /><ActionButton label={t('workout.backToToday')} onPress={() => router.replace('/(tabs)/today')} /></Screen>;

  const allSets = workout.exercises.flatMap((exercise) => exercise.sets);
  const allCollapsed = workout.exercises.every((exercise) => collapsedEntries.get(exercise.entryId) ?? exerciseFinished(exercise.sets));
  const totalSets = groupSets(allSets).length;
  const showBlocks = usesBlocks(workout.exercises);
  const finishedExercises = workout.exercises.filter((exercise) => exercise.sets.length > 0 && exercise.sets.every((set) => set.completedAt)).length;
  const volumeKg = allSets.reduce((sum, set) => (set.completedAt && set.kind === 'working' && set.reps && set.addedLoadKg > 0 ? sum + set.reps * set.addedLoadKg : sum), 0);
  const readinessCount = [workout.sleep, workout.energy, workout.soreness].filter((value) => value !== null).length;
  const timerRunning = hold.active !== null || restSeconds !== null || Boolean(emom.plan && emom.phase);
  const lowReadiness = (workout.sleep !== null && workout.sleep <= 2) || (workout.energy !== null && workout.energy <= 2) || (workout.soreness !== null && workout.soreness >= 4);

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <Screen
        scrollRef={scrollRef}
        // The running clock sits right above Add and Finish, so both stay in reach during rest.
        footerAccessory={timerRunning ? (
          <TimerBar
            emom={emom.plan && emom.phase ? {
              label: emomBarLabel(emom.phase, emom.plan, t),
              display: emom.phase.phase === 'done' ? '0:00' : emom.phase.phase === 'countdown' ? String(emom.phase.secondsLeft) : formatClock(emom.phase.secondsLeft),
              value: emom.plan.field === 'durationSec' ? formatClock(emom.plan.value) : t('emom.reps', { count: emom.plan.value }),
              valueLabel: t('emom.thisRound'),
              onChange: (delta: number) => emom.setValue((emom.plan?.value ?? 0) + delta * (emom.plan?.field === 'durationSec' ? 5 : 1)),
              onStop: () => void emom.stop(),
            } : null}
            hold={hold.active}
            restSeconds={restSeconds}
            onFinishHold={() => void finishCurrentHold()}
            onExtend={() => adjustRest(REST_STEP_SEC)}
            onReduce={() => adjustRest(-REST_STEP_SEC)}
            onSkip={skipRest}
          />
        ) : undefined}
        // Add and Finish stay in reach however long the workout gets.
        footer={workout.exercises.length > 0 ? (
          <>
            <FooterAction icon="add" label={t('workout.addExercise')} secondary onPress={() => setPickerOpen(true)} />
            <FooterAction icon="flag-outline" label={t('workout.finish')} onPress={() => setFinishOpen(true)} />
          </>
        ) : undefined}
      >
        <PageHeading
          title={displayWorkoutName(workout.name, t('log.pastName'))}
          subtitle={[
            t('workout.inProgress', { elapsed }),
            totalSets > 0 ? t('logger.setsProgress', { done: completedCount, total: totalSets }) : null,
            totalSets > 0 ? t('logger.exercisesProgress', { done: finishedExercises, total: workout.exercises.length }) : null,
            volumeKg > 0 ? `${formatNumber(Math.round(volumeKg))} kg` : null,
          ].filter(Boolean).join(' · ')}
          action={
            <Chip
              icon={voiceCues ? 'volume-high' : 'volume-mute-outline'}
              label={t('logger.voiceChip')}
              accessibilityLabel={voiceCues ? t('logger.voiceOn') : t('logger.voiceOff')}
              selected={voiceCues}
              onPress={() => { if (voicePreferenceLoaded) void toggleVoiceCues(); }}
            />
          }
        />

        {totalSets > 0 ? (
          <View style={styles.summary}>
            <ProgressMeter value={completedCount} total={totalSets} label={t('logger.setsProgress', { done: completedCount, total: totalSets })} tone={completedCount === totalSets ? 'success' : 'accent'} />
          </View>
        ) : null}

        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: readinessOpen }}
            onPress={() => setReadinessOpen((open) => !open)}
            style={styles.readinessToggle}
          >
            <Icon name={readinessCount === 3 ? 'checkmark-circle' : 'pulse-outline'} size={20} color={readinessCount === 3 ? palette.success : palette.accentStrong} />
            <View style={styles.shrink}>
              <Text style={[styles.readinessTitle, { color: palette.textMuted }]}>{t('workout.readinessTitle')}</Text>
              {lowReadiness ? <Text style={[styles.readinessHint, { color: palette.warning }]}>{t('workout.readinessSuggestion')}</Text> : null}
            </View>
            <Icon name={readinessOpen ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
          </Pressable>
          {workout.exercises.length > 1 ? <Pressable
            accessibilityRole="button" accessibilityState={{ expanded: !allCollapsed }}
            onPress={() => { tapFeedback(); setCollapsedEntries(new Map(workout.exercises.map((exercise) => [exercise.entryId, !allCollapsed]))); }}
            style={({ pressed }) => [styles.foldAll, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Icon name={allCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={palette.accentStrong} />
            <Text style={[styles.foldAllText, { color: palette.accentStrong }]}>{t(allCollapsed ? 'common.expandAll' : 'common.collapseAll')}</Text>
          </Pressable> : null}
        </View>
        {readinessOpen ? (
          <Card style={styles.readinessCard}>
            <Body>{t('workout.readinessHelp')}</Body>
            <ReadinessRow label={t('workout.sleep')} value={workout.sleep} onChange={(value) => void saveReadiness('sleep', value)} />
            <ReadinessRow label={t('workout.energy')} value={workout.energy} onChange={(value) => void saveReadiness('energy', value)} />
            <ReadinessRow label={t('workout.soreness')} value={workout.soreness} onChange={(value) => void saveReadiness('soreness', value)} />
          </Card>
        ) : null}

        {workout.exercises.length === 0 ? (
          <EmptyState
            icon="barbell-outline"
            title={t('workout.addFirst')}
            body={t('workout.savedDescription')}
            action={(
              <View style={styles.emptyAction}>
                <ActionButton icon="add" label={t('workout.addExercise')} onPress={() => setPickerOpen(true)} />
                <ActionButton icon="close-circle-outline" label={t('workout.discard')} variant="ghost" onPress={() => setDiscardOpen(true)} />
              </View>
            )}
          />
        ) : null}

        {swipeHint && completedCount < 3 && workout.exercises.some((exercise) => exercise.sets.length > 0) ? (
          <Animated.View exiting={itemExiting} style={[styles.swipeHint, { backgroundColor: palette.accentSoft }]}>
            <Icon name="swap-horizontal" size={18} color={palette.accentStrong} />
            <Text style={[styles.swipeHintText, { color: palette.accentStrong }]}>{t('logger.swipeHint')}</Text>
          </Animated.View>
        ) : null}
        <View onLayout={(event) => { listTop.current = event.nativeEvent.layout.y; }}>
        <LayoutAnimationConfig skipEntering>
        <ReorderableList
          items={workout.exercises}
          keyOf={(item) => item.entryId}
          nameOf={(item) => item.name}
          gap={20}
          onMove={(from, to) => void moveExerciseEntry(workout.id, workout.exercises[from].entryId, to).then(() => refresh(workout.id))}
          onRowLayout={(key, top) => { cardTops.current.set(key, listTop.current + top); }}
          renderRow={(exercise, index, row) => (
            <Animated.View entering={exerciseEntering} exiting={itemExiting} layout={rowLayout}>
          {showBlocks && (index === 0 || blockOf(workout.exercises[index - 1].block) !== exercise.block) ? (
            <BlockHeader block={exercise.block} exercises={workout.exercises.filter((item) => item.block === exercise.block)} />
          ) : null}
          <ExerciseCard
            exercise={exercise}
            collapsed={collapsedEntries.get(exercise.entryId) ?? false}
            onToggleCollapsed={() => setCollapsedEntries((current) => new Map(current).set(exercise.entryId, !(current.get(exercise.entryId) ?? false)))}
            handle={workout.exercises.length > 1 ? row.handle : undefined}
            previous={previous.get(exercise.exerciseId)}
            hold={hold.active}
            onChange={changeSet}
            onSetValue={(set, field, value) => void (field === 'addedLoadKg' && value !== 0 ? allowLoad(exercise) : Promise.resolve()).then(() => updateSet(set.id, field, value)).then(() => refresh(workout.id))}
            onComplete={(set) => void completeHoldManually(set)}
            onStartHold={startHoldFor}
            onFinishHold={() => void finishCurrentHold()}
            onAddSet={() => void addSet(exercise.entryId).then(() => refresh(workout.id))}
            onAddWarmup={() => void addWarmupSet(exercise.entryId).then(() => refresh(workout.id))}
            onSetOptions={(set) => setSetSheet({ exercise, setId: set.id })}
            onToggleWarmup={(set) => void toggleWarmup(set)}
            setRecords={records.sets}
            volumeRecord={records.volume.has(exercise.exerciseId)}
            emomLabel={exercise.entryId === emomEntryId && emom.phase ? emomBadge(emom.phase, emom.plan!, t) : null}
            supersetLabel={exercise.groupId ? t('superset.label', { letter: supersetLetters.get(exercise.groupId) ?? 'A' }) : null}
            onUncomplete={(set) => void reopenSet(set)}
            onRemoveSet={(set) => void removeSetFromRow(exercise, set)}
            onSwiped={markSwiped}
            showRpe={showRpe}
            defaultRest={restForSet(exercise.exerciseId, { kind: 'working', restSec: null })}
            onFormRating={(set, rating) => void saveFormRating(set, rating)}
            onRpe={(set, rpe) => void saveRpe(set, rpe)}
            onOptions={() => setOptionsFor(exercise)}
          />
            </Animated.View>
          )}
        />
        </LayoutAnimationConfig>
        </View>

        {workout.exercises.length > 0 ? (
          <Animated.View layout={rowLayout} style={styles.footerActions}>
            <View style={styles.footerRow}>
              <View style={styles.footerCellWide}><ActionButton icon="bookmark-outline" label={t('saveToProgram.action')} variant="ghost" onPress={() => setSaveOpen(true)} /></View>
              <View style={styles.footerCellWide}><ActionButton icon="close-circle-outline" label={t('workout.discard')} variant="ghost" onPress={() => setDiscardOpen(true)} /></View>
            </View>
          </Animated.View>
        ) : null}
      </Screen>


      <Toast
        message={undo?.message ?? null}
        actionLabel={t('logger.restore')}
        onAction={() => {
          const removed = undo?.removed;
          if (removed) void restoreRemoved(removed).then(() => refresh(workout.id));
        }}
        onHide={hideUndo}
        bottomOffset={emom.plan ? 180 : hold.active || restSeconds !== null ? 110 : 0}
      />
      <Toast message={emomNotice} onHide={() => setEmomNotice(null)} />
      <Toast message={loadNotice} onHide={() => setLoadNotice(null)} />

      <EmomSetupSheet
        exercise={emomSetupFor}
        onClose={() => setEmomSetupFor(null)}
        onStart={(config) => {
          setEmomSetupFor(null);
          // The rounds fill this exercise's sets: show them.
          setCollapsedEntries((current) => new Map(current).set(config.entryId, false));
          hold.stop();
          skipRest();
          if (emom.plan) void emom.stop().then(() => emom.start(config));
          else emom.start(config);
        }}
      />
      <SaveToProgramSheet
        visible={saveOpen}
        defaultName={workout.name}
        exercises={workout.exercises}
        onClose={() => setSaveOpen(false)}
        onSaved={(program) => { setSaveOpen(false); setSavedTo({ id: program.id, name: program.name }); }}
      />
      <Toast
        message={savedTo ? t('saveToProgram.saved', { name: savedTo.name }) : null}
        actionLabel={t('saveToProgram.open')}
        onAction={() => { if (savedTo) router.push({ pathname: '/program/user/[id]', params: { id: savedTo.id } }); }}
        onHide={() => setSavedTo(null)}
        bottomOffset={hold.active || restSeconds !== null ? 110 : 0}
      />

      <Sheet
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        title={t('logger.finishTitle')}
        body={completedCount > 0 ? t('logger.finishBody', { count: completedCount }) : t('logger.noCompleted')}
      >
        {workout.exercises.some((e) => e.sets.some((s) => s.completedAt)) ? <ActionButton icon="flag" label={t('workout.finish')} onPress={() => void confirmFinish()} /> : null}
        <ActionButton label={t('logger.keepGoing')} secondary onPress={() => setFinishOpen(false)} />
        {completedCount === 0 ? (
          <ActionButton icon="close-circle-outline" label={t('workout.discard')} variant="danger" onPress={() => { setFinishOpen(false); setDiscardOpen(true); }} />
        ) : null}
      </Sheet>

      <Sheet
        visible={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title={t('workout.discardTitle')}
        body={completedCount > 0 ? t('workout.discardBody', { count: completedCount }) : t('workout.discardBodyEmpty')}
      >
        <ActionButton icon="trash-outline" label={t('workout.discardConfirm')} variant="danger" onPress={() => void confirmDiscard()} />
        <ActionButton label={t('logger.keepGoing')} secondary onPress={() => setDiscardOpen(false)} />
      </Sheet>

      <Sheet visible={optionsFor !== null} onClose={() => setOptionsFor(null)} title={optionsFor?.name ?? t('logger.options')}>
        {optionsFor ? (
          <ExerciseNoteField key={optionsFor.entryId} entryId={optionsFor.entryId} initial={optionsFor.notes} onSaved={() => void refresh(workout.id)} />
        ) : null}
        {optionsFor ? (
          <ExerciseBlockField key={`block-${optionsFor.entryId}-${optionsFor.block}`} entryId={optionsFor.entryId} value={optionsFor.block} onChanged={() => { setOptionsFor(null); void refresh(workout.id); }} />
        ) : null}
        {optionsFor ? (
          <SupersetFields
            key={`superset-${optionsFor.entryId}-${optionsFor.groupId ?? ''}`}
            exercise={optionsFor}
            hasNext={workout.exercises.findIndex((item) => item.entryId === optionsFor.entryId) < workout.exercises.length - 1}
            onChanged={() => { setOptionsFor(null); void refresh(workout.id); }}
          />
        ) : null}
        {optionsFor ? (
          <ExerciseRestFields key={`rest-${optionsFor.entryId}`} entryId={optionsFor.entryId} exerciseId={optionsFor.exerciseId} onSaved={() => void refresh(workout.id)} />
        ) : null}
        {optionsFor && emomFieldFor(optionsFor.metric) ? (
          <ActionButton
            icon="timer-outline"
            label={optionsFor.entryId === emomEntryId ? t('emom.stop') : t('emom.open')}
            secondary
            onPress={() => {
              const exercise = optionsFor;
              setOptionsFor(null);
              if (exercise.entryId === emomEntryId) void emom.stop();
              else setEmomSetupFor(exercise);
            }}
          />
        ) : null}
        <ActionButton
          icon="swap-horizontal"
          label={t('logger.replaceExercise')}
          secondary
          onPress={() => { setReplacing(optionsFor); setOptionsFor(null); setPickerOpen(true); }}
        />
        <ActionButton
          icon="construct-outline"
          label={t('logger.editExercise')}
          secondary
          onPress={() => {
            if (!optionsFor) return;
            const exerciseId = optionsFor.exerciseId;
            setOptionsFor(null);
            router.push({ pathname: '/exercise/new', params: { edit: exerciseId } });
          }}
        />
        <ActionButton
          icon={optionsFor?.demoUrl ? 'create-outline' : 'link'}
          label={optionsFor?.demoUrl ? t('logger.reference') : t('exercise.addReference')}
          secondary
          onPress={() => { setReferenceFor(optionsFor); setOptionsFor(null); }}
        />
        <ActionButton icon="trash-outline" label={t('logger.removeExercise')} variant="danger" onPress={() => { if (optionsFor) void removeExerciseOrConfirm(optionsFor); }} />
      </Sheet>

      <Sheet
        visible={removeExerciseFor !== null}
        onClose={() => setRemoveExerciseFor(null)}
        title={t('logger.removeExerciseTitle', { name: removeExerciseFor?.name ?? '' })}
        body={t('logger.removeExerciseBody', { count: removeExerciseFor?.sets.length ?? 0 })}
      >
        <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => { if (removeExerciseFor) void removeExercise(removeExerciseFor); }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setRemoveExerciseFor(null)} />
      </Sheet>

      {referenceFor ? (
        <ReferenceLinkSheet
          key={referenceFor.entryId}
          visible
          exerciseId={referenceFor.exerciseId}
          exerciseName={referenceFor.name}
          currentUrl={referenceFor.demoUrl}
          onClose={() => setReferenceFor(null)}
          onSaved={() => { setReferenceFor(null); void refresh(workout.id); }}
        />
      ) : null}

      {sheetExercise && sheetSet ? (
        <SetSheet
          key={sheetSet.id}
          exercise={sheetExercise}
          set={sheetSet}
          holdMode={holdModeFor(sheetSet.id)}
          onHoldMode={(mode) => { rememberHoldMode(mode); setHoldModes((current) => new Map(current).set(sheetSet.id, mode)); }}
          onClose={() => setSetSheet(null)}
          onChanged={() => refresh(workout.id)}
          onRemoved={(removed) => offerUndo(t('logger.removedSet', { number: sheetSet.index }), removed)}
          onCompleteManually={() => void completeHoldManually(sheetSet)}
          lastTime={lastTimeFor(sheetExercise, sheetSet, previous.get(sheetExercise.exerciseId))}
          onCopyLast={(values) => { tapFeedback(); setSetSheet(null); void copyValuesToSet(sheetSet.id, values).then(() => refresh(workout.id)); }}
        />
      ) : null}

      <ExercisePicker
        visible={pickerOpen}
        title={replacing ? t('logger.replaceExercise') : t('workout.addExercise')}
        subtitle={replacing ? t('logger.replaceSubtitle', { name: replacing.name }) : t('workout.pickerSubtitle')}
        onChoose={(choice) => void chooseExercise(choice)}
        onCreate={createExercise}
        onClose={() => { setPickerOpen(false); setReplacing(null); }}
      />
    </View>
  );
}

/** Names a block of the workout and shows how much of it is done; drawn above its first exercise. */
function BlockHeader({ block, exercises }: { block: Block; exercises: SessionExercise[] }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const done = exercises.reduce((sum, exercise) => sum + completedSetCount(exercise.sets), 0);
  const total = exercises.reduce((sum, exercise) => sum + groupSets(exercise.sets).length, 0);
  return (
    <View accessibilityRole="header" style={[styles.blockHeader, { borderBottomColor: palette.border }]}>
      <Text style={[styles.blockTitle, { color: palette.text }]}>{t(`workout.blocks.${block}`)}</Text>
      <Text style={[styles.blockCount, { color: palette.textMuted }]}>{t('logger.setsProgress', { done, total })}</Text>
    </View>
  );
}

/** The current time, read inside event handlers only. */
const nowMs = () => Date.now();

/** Rest end times by workout id, so leaving and reopening the workout keeps the same countdown. */
const runningRests = new Map<string, number>();

/** Per-set details kept out of the row: note, form-check video, removal. */
function SetSheet({ exercise, set, holdMode, onHoldMode, onClose, onChanged, onRemoved, onCompleteManually, lastTime, onCopyLast }: {
  exercise: SessionExercise;
  set: SessionSet;
  holdMode: HoldMode;
  onHoldMode: (mode: HoldMode) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
  /** Called with what was removed when the removal can be undone. */
  onRemoved: (removed: RemovedRows | null) => void;
  /** Completes a hold with its entered time, skipping the timer. */
  onCompleteManually: () => void;
  /** Last time's set at the same position, which can be copied into this one. */
  lastTime: PreviousSetValues | null;
  onCopyLast: (values: PreviousSetValues) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(set.note ?? '');
  const [rpe, setRpe] = useState(set.rpe);
  const [form, setForm] = useState(set.formRating);
  const [confirming, setConfirming] = useState(false);
  // Clips cannot be restored, so only a set with clips asks first; any other removal can be undone.
  const needsConfirm = set.clipCount > 0;
  const timed = exercise.metric === 'time' || exercise.metric === 'time_load';

  const saveNote = async () => {
    if ((set.note ?? '') === note.trim()) return;
    await updateSetNote(set.id, note);
    await onChanged();
  };
  const close = () => {
    onClose();
    void saveNote();
  };
  const openVideo = () => {
    close();
    router.push({ pathname: '/form-check/[setId]', params: { setId: set.id } });
  };
  const remove = async () => {
    if (needsConfirm && !confirming) { setConfirming(true); return; }
    onClose();
    onRemoved(await removeSetWithUndo(set.id));
    await onChanged();
  };

  return (
    <Sheet
      visible
      onClose={close}
      title={`${exercise.name} · ${t('logger.setTitle', { number: set.index })}`}
      body={confirming ? t('logger.removeCompletedWarning') : undefined}
    >
      {confirming ? null : (
        <>
          {timed ? (
            <View style={{ gap: 6 }}>
              <Label>{t('logger.holdMode')}</Label>
              <SegmentedControl<HoldMode>
                value={holdMode}
                onChange={onHoldMode}
                options={[{ value: 'free', label: t('logger.holdFree') }, { value: 'target', label: t('logger.holdTarget') }]}
              />
              <Body>{holdMode === 'target' ? t('logger.holdTargetHint', { time: formatClock(set.durationSec ?? 0) }) : t('logger.holdFreeHint')}</Body>
            </View>
          ) : null}
          {timed && !set.completedAt ? (
            <View style={{ gap: 6 }}>
              <ActionButton
                icon="checkmark"
                label={t('logger.markDoneWithTime', { time: formatClock(set.durationSec ?? 0) })}
                secondary
                onPress={() => { close(); onCompleteManually(); }}
              />
              <Body>{t('logger.holdLongPressHint')}</Body>
            </View>
          ) : null}
          {lastTime && !set.completedAt ? (
            <ActionButton icon="arrow-undo-outline" label={t('logger.copyPrevious', { value: describePreviousSet(lastTime, exercise.metric) })} secondary onPress={() => onCopyLast(lastTime)} />
          ) : null}
          <RpePicker value={rpe} onChange={(next) => { setRpe(next); void updateSetRpe(set.id, next).then(onChanged); }} />
          {set.kind === 'working' ? <FormRating value={form} onChange={(next) => { setForm(next); void setSetFormRating(set.id, next).then(onChanged); }} /> : null}
          <TextField
            label={t('logger.noteLabel')}
            value={note}
            onChangeText={setNote}
            placeholder={t('logger.notePlaceholder')}
            multiline
            maxLength={500}
          />
          <ActionButton
            icon={set.clipCount > 0 ? 'play-circle-outline' : 'videocam-outline'}
            label={set.clipCount > 0 ? t('logger.videoView', { count: set.clipCount }) : t('logger.videoAttach')}
            secondary
            onPress={openVideo}
          />
          {(set.poseCount ?? 0) > 0 ? (
            <ActionButton icon="scan-outline" label={t('poseLink.setActionCount', { count: set.poseCount })} secondary onPress={() => { close(); router.push({ pathname: '/pose/[positionId]', params: { positionId: 'free', setId: set.id } }); }} />
          ) : null}
          {poseDetectionAvailable ? (
            <ActionButton icon="body-outline" label={t('poseLink.setAction')} secondary onPress={() => { close(); router.push({ pathname: '/pose/new', params: { positionId: 'free', setId: set.id } }); }} />
          ) : null}
        </>
      )}
      <ActionButton icon="trash-outline" label={confirming ? t('logger.confirmRemove') : t('logger.removeSet')} variant="danger" onPress={() => void remove()} />
      {confirming
        ? <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirming(false)} />
        : <ActionButton label={t('logger.done')} onPress={close} />}
    </Sheet>
  );
}

/** Last time's working set at the same position as `set` (same side for L/R pairs), or null. */
function lastTimeFor(exercise: SessionExercise, set: SessionSet, previous: PreviousPerformance | undefined): PreviousSetValues | null {
  if (set.kind !== 'working' || !previous) return null;
  const workingNumber = groupSets(exercise.sets.filter((item) => item.kind === 'working' && item.index <= set.index)).length;
  const group = groupSets(previous.sets)[workingNumber - 1];
  return group?.find((s) => !set.pairId || s.side === set.side || !s.side || s.side === 'both') ?? null;
}

interface EmomBar {
  label: string;
  display: string;
  value: string;
  valueLabel: string;
  onChange: (delta: number) => void;
  onStop: () => void;
}

/** "Round 3 / 10" on the card while an EMOM runs. */
function emomBadge(phase: EmomPhase, plan: EmomPlan, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (phase.phase === 'running') return t('emom.badge', { round: phase.round, rounds: plan.rounds });
  return t('emom.badgeReady', { rounds: plan.rounds });
}

function emomBarLabel(phase: EmomPhase, plan: EmomPlan, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (phase.phase === 'countdown') return t('emom.getReady');
  if (phase.phase === 'running') return t('emom.round', { round: phase.round, rounds: plan.rounds });
  return t('emom.notifyDone');
}

function TimerBar({ emom, hold, restSeconds, onFinishHold, onExtend, onReduce, onSkip }: {
  emom: EmomBar | null;
  hold: ActiveHold | null;
  restSeconds: number | null;
  onFinishHold: () => void;
  onExtend: () => void;
  onReduce: () => void;
  onSkip: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  if (hold === null && restSeconds === null && emom === null) return null;
  if (emom) {
    return (
      <View style={[styles.timerBar, { backgroundColor: palette.hero }]}>
        <View style={[styles.timerInner, styles.emomInner]}>
        <View style={styles.emomRow}>
          <View style={styles.flex}>
            <Text style={[styles.timerLabel, { color: palette.heroText }]}>{emom.label}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.timerValue, { color: palette.heroText }]}>{emom.display}</Text>
          </View>
          <TimerAction label={t('emom.stopShort')} filled onPress={emom.onStop} />
        </View>
        <View style={styles.emomRow}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.timerLabel, styles.flex, { color: palette.heroText }]}>{emom.valueLabel}</Text>
          <TimerAction label="−" accessibilityLabel={`${emom.valueLabel} −`} onPress={() => emom.onChange(-1)} />
          <Text accessibilityLiveRegion="polite" style={[styles.emomValueText, { color: palette.heroText }]}>{emom.value}</Text>
          <TimerAction label="+" accessibilityLabel={`${emom.valueLabel} +`} onPress={() => emom.onChange(1)} />
        </View>
        </View>
      </View>
    );
  }
  const holding = hold !== null;
  const countingDown = hold?.phase.phase === 'countdown';
  const label = !hold
    ? t('logger.resting')
    : countingDown
      ? t('logger.getReady')
      : hold.mode === 'target'
        ? t('logger.holdingTarget', { time: formatClock(hold.targetSec) })
        : t('logger.holding');
  return (
    <View style={[styles.timerBar, { backgroundColor: palette.hero }]}>
      <View style={styles.timerInner}>
      <View style={styles.timerReadout}>
        <Text style={[styles.timerLabel, { color: palette.heroText }]}>{label}</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.timerValue, { color: palette.heroText }]}>{hold ? holdDisplay(hold) : formatClock(restSeconds ?? 0)}</Text>
      </View>
      {holding ? (
        <TimerAction label={countingDown ? t('common.cancel') : t('logger.doneHold')} filled onPress={onFinishHold} />
      ) : (
        <View style={styles.timerActions}>
          <TimerAction label={t('logger.subtractTime')} onPress={onReduce} />
          <TimerAction label={t('logger.addTime')} onPress={onExtend} />
          <TimerAction label={t('logger.skip')} filled onPress={onSkip} />
        </View>
      )}
      </View>
    </View>
  );
}

function TimerAction({ label, filled = false, accessibilityLabel, onPress }: { label: string; filled?: boolean; accessibilityLabel?: string; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.timerAction, { backgroundColor: filled ? palette.heroText : 'rgba(255,255,255,0.16)', opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={[styles.timerActionText, label.length === 1 && styles.timerActionSymbol, { color: filled ? palette.hero : palette.heroText }]}>{label}</Text>
    </Pressable>
  );
}


function ReadinessRow({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number) => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { t } = useTranslation();
  return <View style={styles.readinessRow}>
    <Text style={styles.readinessLabel}>{label}</Text>
    <View style={styles.readinessOptions}>
      {[1, 2, 3, 4, 5].map((rating) => {
        const selected = value === rating;
        return <Pressable
          key={rating}
          accessibilityRole="button"
          accessibilityLabel={t('workout.readinessRating', { label, rating })}
          accessibilityState={{ selected }}
          onPress={() => { tapFeedback(); onChange(rating); }}
          hitSlop={{ left: 2, right: 2 }}
          style={[styles.readinessOption, { backgroundColor: selected ? palette.accent : palette.surfaceMuted }]}
        ><Text style={[styles.readinessValue, { color: selected ? palette.accentText : palette.text }]}>{rating}</Text></Pressable>;
      })}
    </View>
  </View>;
}


const baseStyles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  readinessToggle: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: MIN_TOUCH_TARGET },
  shrink: { flexShrink: 1 },
  readinessTitle: { fontFamily: fonts.medium, fontSize: 15 },
  readinessHint: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  readinessCard: { gap: 10, marginTop: -10 },
  readinessRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  readinessLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  readinessOptions: { flexDirection: 'row', gap: 6 },
  readinessOption: { width: 44, height: MIN_TOUCH_TARGET, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  readinessValue: { fontFamily: fonts.display, fontSize: 18 },
  emptyAction: { alignSelf: 'stretch', marginTop: 6, gap: 8 },
  blockHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 6, marginBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  blockTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  blockCount: { fontFamily: fonts.medium, fontSize: 13 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  foldAll: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 8 },
  foldAllText: { fontFamily: fonts.semibold, fontSize: 14 },
  summary: { marginTop: -8 },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Long labels: side by side only when each gets room for one line.
  footerCellWide: { flex: 1, minWidth: 220 },
  swipeHint: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  swipeHintText: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  footerActions: { gap: 10, marginTop: 4 },
  timerBar: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  timerInner: { width: '100%', maxWidth: 640, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  timerLabel: { fontFamily: fonts.medium, fontSize: 14, opacity: 0.85 },
  timerValue: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, fontVariant: ['tabular-nums'] },
  timerReadout: { flexGrow: 1, minWidth: 110 },
  timerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emomInner: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  emomRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emomValueText: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
  timerAction: { minWidth: 56, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  timerActionText: { fontFamily: fonts.semibold, fontSize: 15 },
  timerActionSymbol: { fontSize: 26, lineHeight: 30 },
  // The surrounding box carries the border, so the browser focus outline is replaced by it.
});
