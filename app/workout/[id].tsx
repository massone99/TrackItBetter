import { ExerciseSwipeArea } from '../../src/features/session/ExerciseSwipeArea';
import { displayWorkoutName } from '../../src/features/session/workoutName';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { groupSets, completedSetCount } from '../../src/domain/setPairs';
import { ExercisePicker, type ExerciseChoice } from '../../src/features/exercises/ExercisePicker';
import { ReferenceLinkSheet } from '../../src/features/exercises/ReferenceLinkSheet';
import { cancelRestFinishedNotification, scheduleRestFinishedNotification } from '../../src/features/session/restNotifications';
import { restForSet } from '../../src/features/session/restDefaults';
import { supersetStep } from '../../src/features/session/superset';
import { SupersetActions, SupersetSettings } from '../../src/features/session/SupersetFields';
import type { ScrollHandle } from '../../src/shared/components/keyboard';
import { getSessionRecords } from '../../src/features/analytics/repository';
import type { RecordKind, SameLoadRecord, VolumeRecord } from '../../src/features/analytics/records';
import { ExerciseCompareField } from '../../src/features/session/ExerciseCompareField';
import { SwitchSection } from '../../src/features/progressions/SwitchSection';
import { ExerciseAveragesField } from '../../src/features/session/ExerciseAveragesField';
import { ExerciseRestFields } from '../../src/features/session/ExerciseRestFields';
import {
  updateEntryNote,
  addExerciseToWorkout,
  enableExerciseLoad,
  setSetFormRating,
  setSetRomRating,
  updateSetNote,
  addSet,
  completeSet,
  addWarmupsFromLastTime,
  copyValuesToSet,
  switchEntryExercise,
  undoSwitch,
  finishWorkout,
  IncompletePairError,
  changeWorkoutGroups,
  updateWorkoutNote,
  getActiveWorkout,
  getPreviousPerformance,
  setEntryApparatus,
  updateWorkoutDetails,
  removeExerciseEntry,
  removeExerciseEntryWithUndo,
  removeSetWithUndo,
  clearSetsWithUndo,
  discardRemoved,
  restoreRemoved,
  uncompleteSet,
  setSetKind,
  addWarmupSet,
  updateSetRpe,
  updateWorkoutReadiness,
  updateSet,
  setEntryTotalTarget,
  removeSet,
} from '../../src/features/session/repository';
import type { ActiveWorkout, PreviousPerformance, PreviousSetValues, RemovedRows, SessionExercise, SessionSet, SwitchSnapshot } from '../../src/features/session/repository';
import { defaultHoldMode, rememberHoldMode, useHoldTimer, type ActiveHold } from '../../src/features/session/useHoldTimer';
import { adjustedRest, REST_STEP_SEC } from '../../src/domain/restTimer';
import { ExerciseBlockField } from '../../src/features/session/ExerciseBlockField';
import { SetBandsField } from '../../src/features/equipment/SetBandsField';
import { IncompletePairsSheet } from '../../src/features/session/IncompletePairsSheet';
import { incompletePairs, type IncompletePair } from '../../src/features/session/incompletePairs';
import { TelemetryPanel } from '../../src/features/session/telemetry/ExerciseTelemetryDock';
import { WorkoutDockPanel } from '../../src/features/session/DockRails';
import { useExerciseTelemetry } from '../../src/features/session/telemetry/useExerciseTelemetry';
import { useEmom, type EmomAlertText } from '../../src/features/session/useEmom';
import { discardActiveWorkout } from '../../src/features/session/discardWorkout';
import { getExerciseGoals, type ExerciseGoalProgress } from '../../src/features/dailyGoals/repository';
import { EmomSetupSheet, emomFieldFor } from '../../src/features/session/EmomSetupSheet';
import { emomLabel, firstRoundStart, type EmomPhase, type EmomPlan } from '../../src/domain/emom';
import { EmomMiniDock, EmomStage, type EmomView } from '../../src/features/session/EmomStage';
import type { HoldMode } from '../../src/domain/holdTimer';
import { playBeep } from '../../src/shared/audio/beeps';
import {
  ActionButton,
  Body,
  IconButton,
  Label,
  MenuGrid,
  MenuGroup,
  MenuList,
  MenuRow,
  MenuTile,
  Card,
  Chip,
  EmptyState,
  Icon,
  PageHeading,
  Screen,
  Sheet,
  Text,
  Toast,
  tapFeedback,
} from '../../src/shared/components/ui';
import { WorkoutOverview, WorkoutExerciseRow, WorkoutGroupSheet, OverviewButton, useOverviewGroups, type GroupSheet } from '../../src/features/session/WorkoutOverview';
import { workoutSections } from '../../src/features/session/workoutGroups';
import { WorkoutNote, WorkoutNoteSheet, type WorkoutNoteKind } from '../../src/features/session/WorkoutNote';
import { ExerciseSegments } from '../../src/features/session/ExerciseSegments';
import { WorkoutHeader } from '../../src/features/session/WorkoutHeader';
import { FreeRestBar } from '../../src/features/session/FreeRestBar';
import { WorkoutMenuSheet } from '../../src/features/session/WorkoutMenuSheet';
import { TotalGoalSheet } from '../../src/features/session/TotalGoalSheet';
import { nextSetValue, totalProgress } from '../../src/domain/totalGoal';
import { SaveToProgramSheet } from '../../src/features/programs/SaveToProgramSheet';
import { WorkoutDetailsSheet } from '../../src/features/session/WorkoutDetailsSheet';
import { apparatusName, bandComparer, bandsById, describeSetBands, useEquipment } from '../../src/features/equipment/useEquipment';
import { LoadError } from '../../src/shared/components/LoadError';
import { SetSheet } from '../../src/features/session/SetSheet';
import { ExerciseCard, holdDisplay } from '../../src/features/session/ExerciseCard';
import { readBooleanPreference, RPE_PROMPT_KEY, writePreference } from '../../src/shared/settings/preferences';

import { instrument, MIN_TOUCH_TARGET, radii } from '../../src/shared/theme/tokens';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { formatClock } from '../../src/shared/utils/format';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

const VOICE_CUES_KEY = 'workout.voice_cues.enabled';
// Prefer the standalone editor when entering an exercise. The workout itself always opens in overview.
const FOCUS_MODE_KEY = 'workout.focus_mode.v2';
const TELEMETRY_ENABLED_KEY = 'workout.telemetry.enabled';

/** Taps on the same set's done button closer than this are one tap. */
const DOUBLE_TAP_MS = 500;

type NoteTarget = { kind: WorkoutNoteKind; id: string; context: string; value: string | null };

export default function WorkoutScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette, mode, largeText } = useTheme();
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const workoutRef = useRef<ActiveWorkout | null>(null);
  useEffect(() => { workoutRef.current = workout; }, [workout]);
  const [foldedGroups, setFoldedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const [groupSheet, setGroupSheet] = useState<GroupSheet | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const sections = useMemo(() => workout ? workoutSections(workout.exercises, workout.groupLayout) : [], [workout]);
  const groups = useOverviewGroups(sections, workout?.groupLayout);
  const [previous, setPrevious] = useState<Map<string, PreviousPerformance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Entry whose exercise is being replaced; null when the picker adds an exercise instead.
  const [replacing, setReplacing] = useState<SessionExercise | null>(null);
  // A rest keeps running when the screen is left: its end time lives outside the component.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(() => {
    const endsAt = id ? runningRests.get(id) : undefined;
    return endsAt && endsAt > Date.now() ? endsAt : null;
  });
  // Hold mode chosen per set during this session; unset sets use the last mode picked.
  const [holdModes, setHoldModes] = useState<Map<string, HoldMode>>(new Map());
  const holdModeFor = (setId: string) => holdModes.get(setId) ?? defaultHoldMode();
  // The last removal, offered for a few seconds as "Restore".
  const [undo, setUndo] = useState<{ message: string; removed?: RemovedRows; switched?: SwitchSnapshot } | null>(null);
  // Once the Restore offer is gone, clip files kept for it are deleted (files restored meanwhile stay).
  const hideUndo = useCallback(() => setUndo((current) => {
    if (current?.removed) void discardRemoved(current.removed).catch(() => undefined);
    return null;
  }), []);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [dockPanel, setDockPanel] = useState<'workout' | null>(null);
  const [telemetrySheet, setTelemetrySheet] = useState(false);
  const [telemetryOn, setTelemetryOn] = useState(() => readBooleanPreference(TELEMETRY_ENABLED_KEY, true));
  const [focusMode, setFocusMode] = useState(() => readBooleanPreference(FOCUS_MODE_KEY, true));
  const [voiceCues, setVoiceCues] = useState(() => readBooleanPreference(VOICE_CUES_KEY, false));
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { catalog, reload: reloadEquipment } = useEquipment();
  const bandIndex = catalog ? bandsById(catalog) : null;
  const compareBands = catalog ? bandComparer(catalog) : undefined;
  const [finishOpen, setFinishOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedTo, setSavedTo] = useState<{ id: string; name: string } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pairsOpen, setPairsOpen] = useState(false);
  // Self-regulated rest under a total goal: when the clock started, and the rest offered on demand.
  const [freeRest, setFreeRest] = useState<{ since: number; restSec: number } | null>(null);
  const [totalFor, setTotalFor] = useState<SessionExercise | null>(null);
  const [optionsFor, setOptionsFor] = useState<SessionExercise | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [emomSetupFor, setEmomSetupFor] = useState<SessionExercise | null>(null);
  const [emomNotice, setEmomNotice] = useState<string | null>(null);
  // The running EMOM shows full screen; "Workout" closes it to a mini dock at the bottom and the EMOM keeps running.
  const [emomStage, setEmomStage] = useState(true);
  // The round just added, offered for undo: the set added with it and the toast's text.
  const [emomAdded, setEmomAdded] = useState<{ setId: string; message: string } | null>(null);
  // PRs set so far in this workout: record kinds per set, and exercises with a volume mini PR.
  const recordCount = useRef<number | null>(null);
  const [exerciseGoals, setExerciseGoals] = useState<Map<string, ExerciseGoalProgress>>(() => new Map());
  const [records, setRecords] = useState<{ sets: Map<string, RecordKind[]>; volume: VolumeRecord[]; sameLoad: SameLoadRecord[] }>(() => ({ sets: new Map(), volume: [], sameLoad: [] }));
  // A manually opened exercise takes precedence over automatic progression.
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  // Expanding a set only updates state when the exercise changes: the ref answers "same one again" without a render.
  const selectedRef = useRef<string | null>(null);
  const selectEntry = useCallback((entryId: string) => {
    if (selectedRef.current === entryId) return;
    selectedRef.current = entryId;
    setSelectedEntryId(entryId);
  }, []);
  const selectedExercise = useMemo(
    () => workout?.exercises.find((exercise) => exercise.entryId === selectedEntryId && exercise.sets.some((set) => !set.completedAt)) ?? null,
    [workout, selectedEntryId],
  );
  // The exercise of the last working set completed, and in a superset the exercise to do next (the next of the round, else the
  // first of the superset with sets left): after a set, the next one to do is shown, not the exercise that was just done.
  const lastDoneExercise = useMemo(() => {
    let latest: { exercise: SessionExercise; at: number } | null = null;
    for (const exercise of workout?.exercises ?? []) {
      for (const set of exercise.sets) {
        if (set.kind === 'working' && set.completedAt && (latest === null || set.completedAt.getTime() >= latest.at)) latest = { exercise, at: set.completedAt.getTime() };
      }
    }
    return latest?.exercise ?? null;
  }, [workout]);
  const supersetNextExercise = useMemo(() => {
    if (!workout || !lastDoneExercise?.groupId) return null;
    const next = supersetStep(workout.exercises, lastDoneExercise.entryId)?.nextEntryId;
    return workout.exercises.find((exercise) => exercise.entryId === next) ?? null;
  }, [workout, lastDoneExercise]);
  const autoHandExercise = useMemo(
    () => supersetNextExercise ?? workout?.exercises.find((exercise) => exercise.sets.some((set) => !set.completedAt)) ?? null,
    [workout, supersetNextExercise],
  );
  const handExercise = selectedExercise ?? autoHandExercise;
  // Telemetry follows the last set completed (its exercise stays analysed until its last set is done, then the next exercise with sets to do); before any set, the exercise in hand.
  const telemetryExercise = useMemo(() => {
    if (selectedExercise) return selectedExercise;
    if (supersetNextExercise) return supersetNextExercise;
    const latest = lastDoneExercise ? { exercise: lastDoneExercise } : null;
    // Once the last set of that exercise is done, the analysis moves on to the next exercise with sets still to do.
    if (latest && latest.exercise.sets.every((set) => set.completedAt)) {
      const entryId = latest.exercise.entryId;
      const exercises = workout?.exercises ?? [];
      const position = exercises.findIndex((exercise) => exercise.entryId === entryId);
      const hasOpen = (exercise: SessionExercise) => exercise.entryId !== entryId && exercise.sets.some((set) => set.kind === 'working' && !set.completedAt);
      const later = exercises.slice(position + 1).find(hasOpen) ?? exercises.find(hasOpen);
      return later ?? latest.exercise;
    }
    return latest?.exercise ?? handExercise;
  }, [workout, handExercise, selectedExercise, supersetNextExercise, lastDoneExercise]);
  const telemetry = useExerciseTelemetry(telemetryExercise, records.sets);
  const [referenceFor, setReferenceFor] = useState<SessionExercise | null>(null);
  const [removeExerciseFor, setRemoveExerciseFor] = useState<SessionExercise | null>(null);
  const [setSheet, setSetSheet] = useState<{ exercise: SessionExercise; setId: string; view?: 'bands' | 'note' | 'rest' } | null>(null);
  // Set that just got completed and is waiting for an optional RPE tap.
  // RPE chips under every working set; Profile can hide them.
  const [showRpe] = useState(() => readBooleanPreference(RPE_PROMPT_KEY, true));
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);


  const previousKey = useRef<string | null>(null);
  const refresh = useCallback(async (workoutId: string) => {
    const next = await getActiveWorkout(workoutId);
    setWorkout(next);
    if (!next) return;
    // "Last time" only changes when the exercises change, so it is not re-read after every set.
    const exerciseKey = `${next.id}:${next.exercises.map((exercise) => `${exercise.exerciseId}@${exercise.apparatusId ?? ''}${exercise.compareWorkoutId ? `#${exercise.compareWorkoutId}` : ''}`).join(',')}`;
    const apparatusOf = new Map(next.exercises.map((exercise) => [exercise.exerciseId, exercise.apparatusId ?? null] as const));
    const [previousPerformance, found, timeGoals] = await Promise.all([
      previousKey.current === exerciseKey ? null : getPreviousPerformance(next.exercises.map((exercise) => exercise.exerciseId), next.id, apparatusOf),
      getSessionRecords(next.id).catch(() => null),
      // Time goals on these exercises move with every set done, so they are read each time.
      getExerciseGoals(next.exercises.map((exercise) => exercise.exerciseId)).catch(() => new Map<string, ExerciseGoalProgress>()),
    ]);
    setExerciseGoals(timeGoals);
    if (previousPerformance) { previousKey.current = exerciseKey; setPrevious(previousPerformance); }
    if (!found) return;
    const bySet = new Map<string, RecordKind[]>();
    for (const record of found.sets) bySet.set(record.setId, [...(bySet.get(record.setId) ?? []), record.kind]);
    const count = bySet.size + found.volume.length + found.sameLoad.length;
    // Celebrate a new record, but not the ones already there when the workout is reopened.
    if (recordCount.current !== null && count > recordCount.current) tapFeedback('success');
    recordCount.current = count;
    setRecords({ sets: bySet, volume: found.volume, sameLoad: found.sameLoad });
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
      try {
        await refresh(id);
        if (mounted) setLoadFailed(false);
      } catch {
        if (mounted) setLoadFailed(true);
      }
      if (mounted) setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, [id, refresh, loadAttempt]);

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
  const closeEmomStage = useCallback(() => setEmomStage(false), []);
  // Stable: the toast restarts its timer when onHide changes, and the EMOM clock re-renders the screen four times a second.
  const hideEmomAdded = useCallback(() => setEmomAdded(null), []);
  /** One more round at the end of the running EMOM, with the set that will hold it; offered for undo. */
  const addEmomRound = async () => {
    const plan = emom.plan;
    if (!plan || !id) return;
    const setId = await addSet(plan.entryId);
    if (emom.addRound()) {
      const value = plan.field === 'durationSec' ? formatClock(plan.value) : t('emom.reps', { count: plan.value });
      setEmomAdded({ setId, message: t('emom.roundAdded', { round: plan.rounds + 1, value }) });
    } else {
      // The last round is over: the set stays as an ordinary one.
      setEmomAdded(null);
    }
    await refresh(id);
  };
  const undoEmomRound = async () => {
    const added = emomAdded;
    setEmomAdded(null);
    if (!added || !id) return;
    emom.removeRound();
    // A round may already have saved into the new set (fewer planned sets than rounds): then the set stays.
    const set = workoutRef.current?.exercises.flatMap((exercise) => exercise.sets).find((item) => item.id === added.setId);
    if (set && !set.completedAt) await removeSet(added.setId);
    await refresh(id);
  };

  // Returning from the form-check or new-exercise screens brings back clips and exercises added there.
  // The first focus is the mount, which the effect above already loads.
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    if (id && id !== 'new') void refresh(id);
    // Back from the equipment screens or an exercise's settings: new bands and apparatus show at once.
    void reloadEquipment();
  }, [id, refresh, reloadEquipment]));

  /** The rest ran out: the countdown itself lives in the timer bar, so only it re-renders each second. */
  const endRest = () => {
    setRestEndsAt(null);
    if (id) runningRests.delete(id);
    playBeep('done');
  };

  const toggleVoiceCues = () => {
    const enabled = !voiceCues;
    setVoiceCues(enabled);
    writePreference(VOICE_CUES_KEY, String(enabled));
    if (!enabled) void Speech.stop();
  };

  useEffect(() => {
    const updateClock = () => setClockNow(Date.now());
    updateClock();
    const timer = setInterval(updateClock, 15_000);
    return () => clearInterval(timer);
  }, []);

  const completedCount = workout?.exercises.reduce((total, exercise) => total + completedSetCount(exercise.sets), 0) ?? 0;
  // A workout of one set in under three minutes is most likely a test or a slip: finishing offers to discard it.
  const tiny = completedCount === 1 && clockNow !== null && workout !== null && clockNow - workout.startedAt.getTime() < 3 * 60_000;

  const saveReadiness = async (field: 'sleep' | 'energy' | 'soreness', value: number) => {
    if (!workout) return;
    await updateWorkoutReadiness(workout.id, field, value);
    await refresh(workout.id);
  };

  // The set whose rest is running and its total so far: the +/- steps are saved on that set as its rest.
  const restOf = useRef<{ setId: string; total: number } | null>(null);
  const startRestTimer = (seconds: number, setId?: string) => {
    if (setId) restOf.current = { setId, total: Math.floor(seconds) };
    setFreeRest(null);
    const duration = Math.max(1, Math.floor(seconds));
    const endsAt = nowMs() + duration * 1000;
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
    const owner = restOf.current;
    if (owner) {
      const total = Math.max(0, Math.min(3600, owner.total + deltaSec));
      restOf.current = { setId: owner.setId, total };
      void updateSet(owner.setId, 'restSec', total).catch(() => undefined);
    }
    if (remaining === null) { skipRest(); return; }
    void cancelRestFinishedNotification().catch(() => undefined);
    startRestTimer(remaining);
  };

  const skipRest = () => {
    setFreeRest(null);
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

  /** Switches an exercise to one of its tree (or any other): sets done stay with the old one; "Restore" undoes it. */
  const switchTo = async (exercise: SessionExercise, id: string, name: string) => {
    if (!workout) return;
    setOptionsFor(null);
    if (exercise.entryId === emomEntryId) await emom.stop();
    if (hold.active) hold.stop();
    try {
      const snapshot = await switchEntryExercise(exercise.entryId, id);
      setUndo({ message: t('chains.switched', { name }), switched: snapshot });
    } catch {
      setLoadNotice(t('chains.switchError'));
    }
    await refresh(workout.id);
  };

  const chooseExercise = async (exercise: ExerciseChoice) => {
    if (!workout) return;
    if (replacing) {
      if (exercise.id !== replacing.exerciseId) await switchTo(replacing, exercise.id, exercise.name);
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
  const showOverview = useCallback(() => {
    setOpenExerciseId(null);
    setDockPanel(null);
    selectedRef.current = null;
    setSelectedEntryId(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const openExerciseById = useCallback((entryId: string) => {
    setOpenExerciseId(entryId);
    selectEntry(entryId);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [selectEntry]);
  const swipeToExercise = useCallback((entryId: string) => {
    tapFeedback();
    openExerciseById(entryId);
  }, [openExerciseById]);
  const openExercise = (exercise: SessionExercise) => openExerciseById(exercise.entryId);
  const exerciseOpen = workout?.exercises.some((entry) => entry.entryId === openExerciseId) ?? false;
  useFocusEffect(useCallback(() => {
    if (!exerciseOpen || (emomStage && emom.plan)) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      showOverview();
      return true;
    });
    return () => back.remove();
  }, [emom.plan, emomStage, exerciseOpen, showOverview]));
  const openExerciseNote = (exercise: SessionExercise) => setNoteTarget({
    kind: 'exerciseNote', id: exercise.entryId, context: t('liveWorkout.exerciseNoteContext', { name: exercise.name }), value: exercise.notes,
  });
  const openSetOptions = (exercise: SessionExercise, set: SessionSet, view?: 'bands' | 'note' | 'rest') => {
    if (view !== 'note') { setSetSheet({ exercise, setId: set.id, view }); return; }
    const sets = groupSets(exercise.sets.filter((entry) => entry.kind === set.kind));
    const index = sets.findIndex((group) => group.some((entry) => entry.id === set.id)) + 1;
    const side = set.side === 'left' ? t('logger.sideLeft') : set.side === 'right' ? t('logger.sideRight') : null;
    const name = set.kind === 'warmup' ? `${exercise.name} · ${t('ledger.warmup')}` : exercise.name;
    const context = t('liveWorkout.setNoteContext', { name, number: index });
    setNoteTarget({ kind: 'setNote', id: set.id, context: side ? `${context} · ${side}` : context, value: set.note });
  };

  /**
   * Starts the right rest after a set and opens the next exercise in a superset:
   * no rest (or the short one) between exercises, the full rest at the end of the round.
   */
  const afterSetDone = async (setId: string) => {
    const exercise = workout?.exercises.find((item) => item.sets.some((set) => set.id === setId));
    // While an EMOM runs its clock is the rest: no rest timer on top of it.
    if (emomEntryId) return;
    // A total goal: self-regulated rest (a clock counting up), and the next set until the total is reached.
    if (exercise?.totalTarget != null) {
      setRestEndsAt(null);
      void cancelRestFinishedNotification().catch(() => undefined);
      setFreeRest({ since: nowMs(), restSec: restAfter(setId) });
      await continueTotalGoal(exercise, setId);
      return;
    }
    const set = exercise?.sets.find((item) => item.id === setId);
    if (!workout || !exercise || !set) return;
    const recovery = recoveryAfterSet(workout, exercise, set);
    if (recovery.seconds > 0) startRestTimer(recovery.seconds, setId);
    else skipRest();
    if (recovery.nextEntryId && recovery.nextEntryId !== exercise.entryId) {
      setOpenExerciseId((open) => open === exercise.entryId ? recovery.nextEntryId : open);
    }
  };

  /** Under a total goal, adds the next set (the last value, at most what is left) once every set is done and the total is not reached. */
  const continueTotalGoal = async (exercise: SessionExercise, setId: string) => {
    if (exercise.totalTarget == null || !workout) return;
    const sets = exercise.sets.map((set) => (set.id === setId ? { ...set, completedAt: set.completedAt ?? new Date() } : set));
    if (sets.some((set) => !set.completedAt)) return;
    const progress = totalProgress(sets, exercise.metric, exercise.totalTarget);
    if (progress.reached) return;
    const field = exercise.metric === 'time' || exercise.metric === 'time_load' ? 'durationSec' : exercise.metric === 'distance' ? 'distanceM' : 'reps';
    const last = [...sets].reverse().find((set) => set.kind === 'working');
    try {
      const newId = await addSet(exercise.entryId);
      if (!exercise.unilateral) await updateSet(newId, field, nextSetValue(last ? last[field] : null, progress.remaining));
    } catch { /* The set can still be added by hand. */ }
  };

  // Sets whose done state is being saved, and when each last changed: a second tap while saving, or a
  // double tap, would otherwise undo the first one.
  const settling = useRef(new Set<string>());
  const lastToggle = useRef(new Map<string, number>());
  const settle = async (setId: string, work: () => Promise<void>) => {
    const now = nowMs();
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
    // In a superset the next set to do is the one the round says, not the exercise that was expanded: the choice is released.
    if (workout?.exercises.some((exercise) => exercise.groupId && exercise.sets.some((item) => item.id === set.id))) {
      selectedRef.current = null;
      setSelectedEntryId(null);
    }
    patchSet(set.id, { completedAt: new Date() });
    await completeSet(set.id);
    await afterSetDone(set.id);
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

  const saveRomRating = async (set: SessionSet, rating: number | null) => {
    tapFeedback();
    patchSet(set.id, { romRating: rating });
    await setSetRomRating(set.id, rating);
    if (workout) await refresh(workout.id);
  };

  /** Saves a finished hold as the set's time, completes it and starts the rest. */
  const recordHold = async (setId: string, seconds: number) => {
    tapFeedback('success');
    await updateSet(setId, 'durationSec', seconds);
    await completeSet(setId);
    await afterSetDone(setId);
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

  /** Rating a set only saves the RPE: the set is completed by its own button, never by the rating. */
  const rateSet = async (set: SessionSet, rpe: number | null) => {
    await saveRpe(set, rpe);
  };

  const startHoldFor = (set: SessionSet) => {
    if (hold.active || emom.plan) return;
    skipRest();
    hold.start(set.id, holdModeFor(set.id), set.durationSec ?? 30);
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
    // One-sided sets with a single side done block the end: say which, and take the user to them.
    if (incompletePairs(workout.exercises).length > 0) { setPairsOpen(true); return; }
    void Speech.stop();
    void cancelRestFinishedNotification().catch(() => undefined);
    if (emom.plan) await emom.stop();
    try { await finishWorkout(workout.id); }
    catch (error) {
      if (error instanceof IncompletePairError) setPairsOpen(true);
      else Alert.alert(t('history.saveError'), error instanceof Error ? error.message : String(error));
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
    try {
      await discardActiveWorkout(workout.id);
    } catch {
      Alert.alert(t('history.deleteError'));
      return;
    }
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

  /** Empties an exercise (or the whole workout) of sets and keeps the exercises; "Restore" puts them back. */
  const clearSets = async (scope: { exercise: SessionExercise } | null) => {
    setOptionsFor(null);
    setClearAllOpen(false);
    if (!workout) return;
    const targets = scope ? [scope.exercise] : workout.exercises;
    if (hold.active) hold.stop();
    if (targets.some((exercise) => exercise.entryId === emomEntryId)) await emom.stop();
    const count = targets.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    offerUndo(t('logger.clearedSets', { count }), await clearSetsWithUndo(scope ? { entryId: scope.exercise.entryId } : { workoutId: workout.id }));
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
  if (loadFailed) return <Screen><LoadError onRetry={() => { setLoading(true); setLoadAttempt((count) => count + 1); }} /></Screen>;
  if (!workout) return <Screen><PageHeading title={t('workout.unavailable')} subtitle={t('workout.finished')} /><ActionButton label={t('workout.backToToday')} onPress={() => router.replace('/(tabs)/today')} /></Screen>;

  const totalSets = workout.exercises.reduce((total, exercise) => total + groupSets(exercise.sets).length, 0);
  const workoutName = displayWorkoutName(workout.name, t('log.pastName'));
  const focused = workout.exercises.find((exercise) => exercise.entryId === openExerciseId);
  const next = handExercise;
  const scheduledSet = focused?.sets.find((set) => !set.completedAt);
  const scheduledRest = focused && scheduledSet ? recoveryAfterSet(workout, focused, scheduledSet).seconds : null;
  const scheduledNumber = focused && scheduledSet
    ? groupSets(focused.sets.filter((set) => set.kind === scheduledSet.kind && set.index <= scheduledSet.index)).length
    : 0;
  const exercisePosition = focused ? workout.exercises.indexOf(focused) + 1 : 0;
  const previousExercise = focused ? workout.exercises[exercisePosition - 2] : undefined;
  const followingExercise = focused ? workout.exercises[exercisePosition] : undefined;
  const canFold = groups.length > 0;
  const allFoldKeys = groups.flatMap((group) => [`group:${group.id ?? 'loose'}`, ...(group.nested ?? []).map((item) => `superset:${item.id}`)]);
  const allCollapsed = allFoldKeys.length > 0 && allFoldKeys.every((key) => foldedGroups.has(key));
  const background = mode === 'light' ? '#eaeff2' : palette.background;
  const footerColor = mode === 'light' ? '#f5f7f9' : palette.background;
  const nextOther = next && next.entryId !== focused?.entryId ? next
    : workout.exercises.slice(exercisePosition).find((entry) => entry.sets.some((set) => !set.completedAt));
  const emomExercise = emom.plan ? workout.exercises.find((item) => item.entryId === emom.plan?.entryId) ?? null : null;
  const emomView: EmomView | null = emom.plan && emom.phase ? {
    exercise: emomExercise?.name ?? '',
    intervalSec: emom.plan.intervalSec,
    rounds: emom.plan.rounds,
    phase: emom.phase,
    done: emomDoneValues(emomExercise, emom.plan),
    value: emom.plan.value,
    field: emom.plan.field,
    canAddRound: emom.phase.phase !== 'done' && !(emom.phase.phase === 'running' && emom.phase.round >= emom.plan.rounds),
  } : null;
  const lowReadiness = (workout.sleep !== null && workout.sleep <= 2) || (workout.energy !== null && workout.energy <= 2) || (workout.soreness !== null && workout.soreness >= 4);
  const toastOffset = footerHeight + 8;
  const actions = (
    <View style={[styles.footerRow, largeText && styles.footerStacked]}>
      <OverviewButton label={t('workout.addExercise')} icon="add" accent grow onPress={() => setPickerOpen(true)} />
      <OverviewButton label={t('liveWorkout.finish')} grow={largeText} onPress={() => setFinishOpen(true)} />
    </View>
  );
  const renderExercise = (exercise: SessionExercise) => {
    const copyable = copyableSets(exercise, previous.get(exercise.exerciseId));
    return (
      <ExerciseCard
        key={exercise.entryId}
        focus
        liveLayout={focusMode ? 'standalone' : 'inline'}
        wrapSetEditor={(editor) => (
          <ExerciseSwipeArea previousId={previousExercise?.entryId} nextId={followingExercise?.entryId} onNavigate={swipeToExercise}>
            {editor}
          </ExerciseSwipeArea>
        )}
        exerciseNavigation={previousExercise || followingExercise ? (
          <View style={styles.exerciseNavigation}>
            <IconButton icon="chevron-back" tone="plain" label={t('liveWorkout.previousMovement')} disabled={!previousExercise}
              onPress={() => { if (previousExercise) openExercise(previousExercise); }} />
            <IconButton icon="chevron-forward" tone="plain" label={t('liveWorkout.nextMovement')} disabled={!followingExercise}
              onPress={() => { if (followingExercise) openExercise(followingExercise); }} />
          </View>
        ) : null}
        onOpenExerciseNote={() => openExerciseNote(exercise)}
        onSetExpanded={() => selectEntry(exercise.entryId)}
        exercise={exercise}
        collapsed={false}
        onToggleCollapsed={showOverview}
        previous={previous.get(exercise.exerciseId)}
        hold={hold.active}
        onChange={changeSet}
        onSetValue={(set, field, value) => void (field === 'addedLoadKg' && value !== 0 ? allowLoad(exercise) : Promise.resolve()).then(() => updateSet(set.id, field, value)).then(() => refresh(workout.id))}
        onComplete={(set) => void completeHoldManually(set)}
        onStartHold={startHoldFor}
        onFinishHold={() => void finishCurrentHold()}
        onAddSet={() => void (exercise.entryId === emomEntryId ? addEmomRound() : addSet(exercise.entryId).then(() => refresh(workout.id)))}
        onAddWarmup={() => void addWarmupSet(exercise.entryId).then(() => refresh(workout.id))}
        onCopyAllLast={copyable.length > 0 || missingWarmups(exercise, previous.get(exercise.exerciseId)) > 0 ? () => void Promise.all(copyable.map(({ set, values }) => copyValuesToSet(set.id, values)))
          .then(() => addWarmupsFromLastTime(exercise.entryId, previous.get(exercise.exerciseId)?.warmups ?? []))
          .then(() => refresh(workout.id)) : undefined}
        onSetOptions={(set, view) => openSetOptions(exercise, set, view)}
        onToggleWarmup={(set) => void toggleWarmup(set)}
        setRecords={records.sets}
        volumeRecords={records.volume.filter((record) => record.exerciseId === exercise.exerciseId)}
        sameLoadRecords={records.sameLoad.filter((record) => record.exerciseId === exercise.exerciseId)}
        timeGoals={exerciseGoals.get(exercise.exerciseId) ?? null}
        emomLabel={exercise.entryId === emomEntryId && emom.phase ? emomBadge(emom.phase, emom.plan!, t) : null}
        onUncomplete={(set) => void reopenSet(set)}
        onRemoveSet={(set) => void removeSetFromRow(exercise, set)}
        showRpe={showRpe}
        defaultRest={restForSet(exercise.exerciseId, { kind: 'working', restSec: null })}
        onFormRating={(set, rating) => void saveFormRating(set, rating)}
        onRomRating={(set, rating) => void saveRomRating(set, rating)}
        typeDone
        apparatusLabel={exercise.apparatusId && catalog ? apparatusName(catalog.apparatus.find((item) => item.id === exercise.apparatusId), t) : null}
        firstTimeLabel={exercise.apparatusAffectsDifficulty && exercise.apparatusId && catalog ? t('equipment.firstTimeOn', { name: apparatusName(catalog.apparatus.find((item) => item.id === exercise.apparatusId), t) }) : undefined}
        describeBands={(set) => (bandIndex ? describeSetBands(set, bandIndex, t) : null)}
        compareBands={compareBands}
        renderBandsEditor={(set) => <SetBandsField key={set.id} exercise={exercise} set={set} onChanged={() => refresh(workout.id)} />}
        onRpe={(set, rpe) => void rateSet(set, rpe)}
        onOptions={() => setOptionsFor(exercise)}
          />
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <Screen
        scrollRef={scrollRef}
        backdrop={null}
        backgroundColor={background}
        footerColor={footerColor}
        columnStyle={styles.workoutColumn}
        footerAccessory={<View style={styles.dockStack} onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
          {emomView ? (
            <EmomMiniDock view={emomView} label={emomBadge(emomView.phase, emom.plan!, t)} onOpen={() => setEmomStage(true)} />
          ) : hold.active || restEndsAt !== null ? (
            <TimerBar
              hold={hold.active}
              restEndsAt={restEndsAt}
              voiceCues={voiceCues}
              onRestEnd={endRest}
              onFinishHold={() => void finishCurrentHold()}
              onExtend={() => adjustRest(REST_STEP_SEC)}
              onReduce={() => adjustRest(-REST_STEP_SEC)}
              onSkip={skipRest}
              nextName={next?.name}
            />
          ) : freeRest ? (
            <FreeRestBar since={freeRest.since} restSec={freeRest.restSec} onStartRest={() => startRestTimer(freeRest.restSec)} onClose={() => setFreeRest(null)} />
          ) : focused && scheduledRest !== null ? (
            <View style={[styles.plannedRest, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.flex}>
                <Text style={styles.plannedLabel}>{t('liveWorkout.plannedRest')}</Text>
                <Text style={styles.plannedValue}>{formatClock(scheduledRest)}</Text>
              </View>
              <Text style={[styles.shrink, styles.plannedLabel]}>{t('liveWorkout.afterSet', { number: scheduledNumber })}</Text>
            </View>
          ) : null}
          {focused ? (
            <>
              {dockPanel === 'workout' ? (
                <WorkoutDockPanel title={t('dock.workoutPanel', { current: exercisePosition, total: workout.exercises.length })}
                  options={[
                    { id: 'add', icon: 'add', label: t('workout.addExercise'), hint: t('dock.addHint'), tone: 'normal', onPress: () => { setDockPanel(null); setPickerOpen(true); } },
                    { id: 'finish', icon: 'flag-outline', label: t('workout.finish'), hint: t('dock.finishHint'), tone: 'primary', onPress: () => { setDockPanel(null); setFinishOpen(true); } },
                    { id: 'discard', icon: 'close-circle-outline', label: t('workout.discard'), hint: t('dock.discardHint'), tone: 'danger', onPress: () => { setDockPanel(null); setDiscardOpen(true); } },
                  ]} />
              ) : null}
              <View style={styles.railsRow}>
                {telemetryOn ? <Pressable accessibilityRole="button" style={styles.rail} onPress={() => { tapFeedback(); setTelemetrySheet(true); }}>
                  <Icon name="speedometer-outline" size={18} color={palette.textMuted} />
                  <Text style={styles.railLabel}>{t('dock.telemetry')}</Text>
                </Pressable> : null}
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: dockPanel === 'workout' }} style={styles.rail}
                  onPress={() => { tapFeedback(); setDockPanel(dockPanel === 'workout' ? null : 'workout'); }}>
                  <Icon name="list-outline" size={18} color={palette.textMuted} />
                  <Text style={styles.railLabel}>{t('liveWorkout.workoutRail', { current: exercisePosition, total: workout.exercises.length })}</Text>
                </Pressable>
              </View>
            </>
          ) : actions}
        </View>}
      >
        <WorkoutHeader
          title={workoutName}
          startedAt={workout.startedAt}
          done={completedCount}
          total={totalSets}
          onBack={focused ? showOverview : undefined}
          onTitleLongPress={() => setDetailsOpen(true)}
          titleLongPressLabel={t('workoutDetails.editHint')}
          onMenu={() => setMenuOpen(true)}
        />
        {workout.exercises.length > 0 ? <ExerciseSegments exercises={workout.exercises} currentId={next?.entryId ?? null} done={completedCount} total={totalSets} /> : null}
        <WorkoutNote kind="workoutNote" value={workout.notes} onPress={() => setNoteTarget({ kind: 'workoutNote', id: workout.id, context: workoutName, value: workout.notes })} />

        {readinessOpen ? (
          <Card style={styles.readinessCard}>
            <View style={styles.readyHeader}>
              <Text style={styles.readinessTitle}>{t('workout.readinessTitle')}</Text>
              <IconButton icon="close" tone="plain" label={t('common.close')} onPress={() => setReadinessOpen(false)} />
            </View>
            <Body>{t('workout.readinessHelp')}</Body>
            {lowReadiness ? <Text style={[styles.readinessHint, { color: palette.warning }]}>{t('workout.readinessSuggestion')}</Text> : null}
            <ReadinessRow label={t('workout.sleep')} value={workout.sleep} onChange={(value) => void saveReadiness('sleep', value)} />
            <ReadinessRow label={t('workout.energy')} value={workout.energy} onChange={(value) => void saveReadiness('energy', value)} />
            <ReadinessRow label={t('workout.soreness')} value={workout.soreness} onChange={(value) => void saveReadiness('soreness', value)} />
          </Card>
        ) : null}


        {focused ? <>
          {renderExercise(focused)}
          {nextOther ? <View style={styles.dockStack}>
            <Label>{t('liveWorkout.nextMovement')}</Label>
            <WorkoutExerciseRow exercise={nextOther} next={nextOther.entryId === next?.entryId} onPress={() => openExercise(nextOther)} />
          </View> : null}
        </> : <>
          <WorkoutOverview groups={groups} folded={foldedGroups} nextId={next?.entryId ?? null}
            onFold={(key) => setFoldedGroups((current) => {
              const updated = new Set(current);
              if (updated.has(key)) updated.delete(key); else updated.add(key);
              return updated;
            })}
            onFoldAll={(keys) => { setFoldedGroups(new Set(keys)); if (keys.length) showOverview(); }}
            onGroupSheet={setGroupSheet}
            renderExercise={(exercise, marker) => (
              <WorkoutExerciseRow exercise={exercise} marker={marker} next={exercise.entryId === next?.entryId} onPress={() => openExercise(exercise)} />
            )}
          />
          {workout.exercises.length === 0 ? <EmptyState icon="barbell-outline" title={t('workout.addFirst')} body={t('workout.savedDescription')} /> : null}
        </>}
      </Screen>

      {noteTarget ? <WorkoutNoteSheet key={`${noteTarget.kind}:${noteTarget.id}`} kind={noteTarget.kind} initial={noteTarget.value} context={noteTarget.context}
        onClose={() => setNoteTarget(null)}
        onSave={async (value) => {
          if (noteTarget.kind === 'setNote') await updateSetNote(noteTarget.id, value);
          else if (noteTarget.kind === 'exerciseNote') await updateEntryNote(noteTarget.id, value);
          else await updateWorkoutNote(noteTarget.id, value);
          await refresh(workout.id);
        }} /> : null}
      {groupSheet ? <WorkoutGroupSheet
        key={`${groupSheet.view}:${'group' in groupSheet ? groupSheet.group.id : groupSheet.parent?.id ?? ''}`}
        sheet={groupSheet} groups={groups} exercises={workout.exercises} onClose={() => setGroupSheet(null)} onChange={setGroupSheet}
        onSave={async (change) => {
          await changeWorkoutGroups(workout.id, change);
          await refresh(workout.id);
          if (change.type === 'deleteGroup' || change.type === 'deleteSuperset') setFoldedGroups((current) => {
            const next = new Set(current);
            next.delete(`group:${change.id}`);
            next.delete(`superset:${change.id}`);
            next.delete('group:loose');
            return next;
          });
          if (change.type === 'superset') setFoldedGroups((current) => {
            const next = new Set(current);
            next.delete(`group:${change.parentId ?? 'loose'}`);
            if (change.id) next.delete(`superset:${change.id}`);
            return next;
          });
        }} /> : null}
      <WorkoutMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        focusMode={focusMode}
        telemetryOn={telemetryOn}
        voiceCues={voiceCues}
        canFold={canFold}
        allCollapsed={allCollapsed}
        canNarrate={workout.exercises.some((exercise) => exercise.sets.some((set) => !set.completedAt))}
        canClear={workout.exercises.some((exercise) => exercise.sets.length > 0)}
        onCheckIn={() => setReadinessOpen(true)}
        onFocus={() => { tapFeedback(); setDockPanel(null); setFocusMode(!focusMode); writePreference(FOCUS_MODE_KEY, String(!focusMode)); }}
        onTelemetry={() => { tapFeedback(); setTelemetryOn(!telemetryOn); writePreference(TELEMETRY_ENABLED_KEY, String(!telemetryOn)); }}
        onVoice={toggleVoiceCues}
        onNarrate={() => router.push({ pathname: '/workout/narrate/[id]', params: { id: workout.id } })}
        onFoldAll={() => { showOverview(); setFoldedGroups(new Set(allCollapsed ? [] : allFoldKeys)); }}
        onOverview={focused ? showOverview : undefined}
        onShowTelemetry={telemetryOn ? () => setTelemetrySheet(true) : undefined}
        onDiscard={() => setDiscardOpen(true)}
        onDetails={() => setDetailsOpen(true)}
        onSave={() => setSaveOpen(true)}
        onClear={() => setClearAllOpen(true)}
      />
      <IncompletePairsSheet
        visible={pairsOpen}
        pairs={incompletePairs(workout.exercises)}
        onClose={() => setPairsOpen(false)}
        onGo={(pair: IncompletePair) => {
          setPairsOpen(false);
          const exercise = workout.exercises.find((entry) => entry.entryId === pair.entryId);
          if (exercise) {
            setFoldedGroups(new Set());
            openExercise(exercise);
          }
        }}
      />
      <Sheet visible={telemetrySheet} onClose={() => setTelemetrySheet(false)} title={t('telemetry.title')}>
        {telemetry ? <TelemetryPanel view={telemetry} bordered={false} /> : <Body>{t('telemetry.empty')}</Body>}
      </Sheet>
      <Toast
        message={undo?.message ?? null}
        actionLabel={t('logger.restore')}
        onAction={() => {
          const removed = undo?.removed;
          if (removed) void restoreRemoved(removed).then(() => refresh(workout.id));
          if (undo?.switched) void undoSwitch(undo.switched).then(() => refresh(workout.id));
        }}
        onHide={hideUndo}
        bottomOffset={toastOffset}
      />
      {emomView && emomStage ? (
        <EmomStage
          view={emomView}
          onChange={(delta) => emom.setValue((emom.plan?.value ?? 0) + delta * (emom.plan?.field === 'durationSec' ? 5 : 1))}
          onAddRound={() => void addEmomRound()}
          onStop={() => void emom.stop()}
          onClose={closeEmomStage}
        />
      ) : null}
      {/* Above the EMOM screen (which sits on its own layer), touches pass through around the toast. */}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overStage]}>
        <Toast
          message={emomAdded?.message ?? null}
          actionLabel={t('emom.undo')}
          onAction={() => void undoEmomRound()}
          onHide={hideEmomAdded}
          bottomOffset={emomView && emomStage ? 160 : toastOffset}
        />
      </View>
      <Toast bottomOffset={toastOffset} message={emomNotice} onHide={() => setEmomNotice(null)} />
      <Toast bottomOffset={toastOffset} message={loadNotice} onHide={() => setLoadNotice(null)} />

      <EmomSetupSheet
        exercise={emomSetupFor}
        onClose={() => setEmomSetupFor(null)}
        onStart={(config) => {
          setEmomSetupFor(null);
          // The rounds fill this exercise's sets: show them.
          setFoldedGroups(new Set());
          setOpenExerciseId(config.entryId);
          hold.stop();
          skipRest();
          setEmomStage(true);
          if (emom.plan) void emom.stop().then(() => emom.start(config));
          else emom.start(config);
        }}
      />
      <SaveToProgramSheet
        visible={saveOpen}
        defaultName={workout.name}
        workoutId={workout.id}
        exercises={workout.exercises}
        onClose={() => setSaveOpen(false)}
        onSaved={(program) => { setSaveOpen(false); setSavedTo({ id: program.id, name: program.name }); }}
      />
      <Toast
        message={savedTo ? t('saveToProgram.saved', { name: savedTo.name }) : null}
        actionLabel={t('saveToProgram.open')}
        onAction={() => { if (savedTo) router.push({ pathname: '/program/user/[id]', params: { id: savedTo.id } }); }}
        onHide={() => setSavedTo(null)}
        bottomOffset={toastOffset}
      />

      <Sheet
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        title={t('logger.finishTitle')}
        body={completedCount > 0 ? `${t('logger.finishBody', { count: completedCount })}${tiny ? `\n\n${t('logger.tinyWorkout')}` : ''}` : t('logger.noCompleted')}
      >
        {workout.exercises.some((e) => e.sets.some((s) => s.completedAt)) ? <ActionButton icon="flag" label={t('workout.finish')} onPress={() => void confirmFinish()} /> : null}
        <ActionButton label={t('logger.keepGoing')} secondary onPress={() => setFinishOpen(false)} />
        {completedCount === 0 || tiny ? (
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

      <WorkoutDetailsSheet
        key={`${workout.id}:${detailsOpen}`}
        visible={detailsOpen}
        kind="performed"
        name={workout.name}
        notes={workout.notes}
        onClose={() => setDetailsOpen(false)}
        onSave={async (details) => { await updateWorkoutDetails(workout.id, details); await refresh(workout.id); setDetailsOpen(false); }}
      />

      <Sheet visible={optionsFor !== null} onClose={() => setOptionsFor(null)} title={optionsFor?.name ?? t('logger.options')}>
        {optionsFor ? (
          <>
            <SwitchSection key={`switch-${optionsFor.entryId}-${optionsFor.exerciseId}`} exercise={optionsFor} onSwitch={(id, name) => void switchTo(optionsFor, id, name)} onOther={() => { setReplacing(optionsFor); setOptionsFor(null); setPickerOpen(true); }} />
            <WorkoutNote kind="exerciseNote" value={optionsFor.notes} onPress={() => { setOptionsFor(null); openExerciseNote(optionsFor); }} />
            {catalog && (optionsFor.apparatusIds?.length ?? 0) > 0 ? (
              <MenuGroup title={t('equipment.apparatusInWorkout')}>
                <View style={styles.choiceRow}>
                  {optionsFor.apparatusIds!.map((apparatusId) => (
                    <Chip
                      key={apparatusId}
                      label={apparatusName(catalog.apparatus.find((item) => item.id === apparatusId), t)}
                      selected={optionsFor.apparatusId === apparatusId}
                      onPress={() => { const entryId = optionsFor.entryId; setOptionsFor(null); void setEntryApparatus(entryId, apparatusId).then(() => refresh(workout.id)); }}
                    />
                  ))}
                </View>
                {optionsFor.apparatusAffectsDifficulty ? <Label>{t('equipment.apparatusCompareHint')}</Label> : null}
              </MenuGroup>
            ) : null}
            <ExerciseCompareField key={`compare-${optionsFor.entryId}`} exercise={optionsFor} workoutId={workout.id} workoutName={workout.name} onChanged={() => void refresh(workout.id)} />
            <ExerciseAveragesField key={`averages-${optionsFor.entryId}`} exercise={optionsFor} onChanged={() => void refresh(workout.id)} />
            {!workout.groupLayout ? <ExerciseBlockField key={`block-${optionsFor.entryId}-${optionsFor.block}`} entryId={optionsFor.entryId} value={optionsFor.block} onChanged={() => { setOptionsFor(null); void refresh(workout.id); }} /> : null}
            <SupersetSettings key={`superset-${optionsFor.entryId}-${optionsFor.groupId ?? ''}`} exercise={optionsFor} />
            <ExerciseRestFields key={`rest-${optionsFor.entryId}`} exercise={optionsFor} onSaved={() => void refresh(workout.id)} />
            <MenuGrid>
              <SupersetActions
                key={`superset-actions-${optionsFor.entryId}-${optionsFor.groupId ?? ''}`}
                exercise={optionsFor}
                hasNext={(() => {
                  const candidate = workout.exercises[workout.exercises.findIndex((item) => item.entryId === optionsFor.entryId) + 1];
                  return Boolean(candidate && (workout.groupLayout ? candidate.workoutGroupId === optionsFor.workoutGroupId : candidate.block === optionsFor.block));
                })()}
                onChanged={() => { setOptionsFor(null); void refresh(workout.id); }}
              />
              {([-1, 1] as const).map((offset) => {
                const candidate = workout.exercises[workout.exercises.findIndex((item) => item.entryId === optionsFor.entryId) + offset];
                const sameGroup = candidate && (workout.groupLayout ? candidate.workoutGroupId === optionsFor.workoutGroupId : candidate.block === optionsFor.block);
                if (!sameGroup || candidate.groupId !== optionsFor.groupId) return null;
                return <MenuTile key={offset} icon={offset < 0 ? 'arrow-up' : 'arrow-down'} label={t(offset < 0 ? 'liveWorkout.moveUp' : 'liveWorkout.moveDown')}
                  onPress={() => { setOptionsFor(null); void changeWorkoutGroups(workout.id, { type: 'moveExercise', id: optionsFor.entryId, offset }).then(() => refresh(workout.id)); }} />;
              })}
              {emomFieldFor(optionsFor.metric) ? (
                <MenuTile
                  icon="timer-outline"
                  label={optionsFor.entryId === emomEntryId ? t('emom.stop') : t('emom.open')}
                  onPress={() => {
                    const exercise = optionsFor;
                    setOptionsFor(null);
                    if (exercise.entryId === emomEntryId) void emom.stop();
                    else setEmomSetupFor(exercise);
                  }}
                />
              ) : null}
              <MenuTile icon="flag-outline" label={optionsFor.totalTarget != null ? t('totalGoal.edit') : t('totalGoal.set')} onPress={() => { setTotalFor(optionsFor); setOptionsFor(null); }} />
              <MenuTile icon="swap-horizontal" label={t('logger.replaceExercise')} onPress={() => { setReplacing(optionsFor); setOptionsFor(null); setPickerOpen(true); }} />
              <MenuTile
                icon="construct-outline"
                label={t('logger.editExercise')}
                onPress={() => {
                  const exerciseId = optionsFor.exerciseId;
                  setOptionsFor(null);
                  router.push({ pathname: '/exercise/new', params: { edit: exerciseId } });
                }}
              />
              <MenuTile icon={optionsFor.demoUrl ? 'create-outline' : 'link'} label={optionsFor.demoUrl ? t('logger.reference') : t('exercise.addReference')} onPress={() => { setReferenceFor(optionsFor); setOptionsFor(null); }} />
            </MenuGrid>
            <MenuList>
              {optionsFor.sets.length > 0 ? <MenuRow tone="danger" icon="remove-circle-outline" label={t('logger.clearSets')} onPress={() => void clearSets({ exercise: optionsFor })} /> : null}
              <MenuRow tone="danger" icon="trash-outline" label={t('logger.removeExercise')} onPress={() => void removeExerciseOrConfirm(optionsFor)} />
            </MenuList>
          </>
        ) : null}
      </Sheet>

      <TotalGoalSheet
        exercise={totalFor}
        onClose={() => setTotalFor(null)}
        onSave={(value) => {
          const target = totalFor;
          setTotalFor(null);
          if (target) void setEntryTotalTarget(target.entryId, value).then(() => refresh(workout.id));
        }}
      />

      <Sheet
        visible={clearAllOpen}
        onClose={() => setClearAllOpen(false)}
        title={t('logger.clearAllTitle')}
        body={t('logger.clearAllBody', { count: workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) })}
      >
        <ActionButton icon="remove-circle-outline" label={t('logger.clearAllConfirm')} variant="danger" onPress={() => void clearSets(null)} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setClearAllOpen(false)} />
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
          key={`${sheetSet.id}:${setSheet?.view ?? ''}`}
          initialView={setSheet?.view}
          onOpenNote={() => { setSetSheet(null); openSetOptions(sheetExercise, sheetSet, 'note'); }}
          onToggleWarmup={sheetExercise.entryId === emomEntryId ? undefined : () => { setSetSheet(null); void toggleWarmup(sheetSet); }}
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

/** The current time, read inside event handlers only. */
const nowMs = () => Date.now();

/** Rest end times by workout id, so leaving and reopening the workout keeps the same countdown. */
const runningRests = new Map<string, number>();


/** Used by the rest preview and the timer that actually runs after recording the set. */
function recoveryAfterSet(workout: ActiveWorkout, exercise: SessionExercise, set: SessionSet) {
  const normal = restForSet(exercise.exerciseId, set);
  const otherSidePending = set.pairId && exercise.sets.some((row) => row.pairId === set.pairId && row.id !== set.id && !row.completedAt);
  if (otherSidePending) return { seconds: exercise.unilateralRestMode === 'side' ? normal : 0, nextEntryId: exercise.entryId };
  if (!exercise.groupId) return { seconds: normal, nextEntryId: null };
  const marked = workout.exercises.map((entry) => entry.entryId === exercise.entryId
    ? { ...entry, sets: entry.sets.map((row) => row.id === set.id ? { ...row, completedAt: workout.startedAt } : row) }
    : entry);
  const step = supersetStep(marked, exercise.entryId);
  const seconds = !step || step.endOfRound ? normal : step.mode === 'between' ? step.betweenSec : 0;
  return { seconds, nextEntryId: step?.nextEntryId ?? null };
}

/** Last time's working set at the same position as `set` (same side for L/R pairs), or null. */
function lastTimeFor(exercise: SessionExercise, set: SessionSet, previous: PreviousPerformance | undefined): PreviousSetValues | null {
  if (!previous) return null;
  // Warm-ups match warm-ups, working sets match working sets, by position within their kind.
  const number = groupSets(exercise.sets.filter((item) => item.kind === set.kind && item.index <= set.index)).length;
  const group = groupSets(set.kind === 'warmup' ? previous.warmups : previous.sets)[number - 1];
  return group?.find((s) => !set.pairId || s.side === set.side || !s.side || s.side === 'both') ?? null;
}

/** How many warm-ups of last time this exercise does not have yet (they come with "copy last time"). */
function missingWarmups(exercise: SessionExercise, previous: PreviousPerformance | undefined): number {
  if (!previous) return 0;
  return Math.max(0, groupSets(previous.warmups).length - groupSets(exercise.sets.filter((set) => set.kind === 'warmup')).length);
}

/** The open sets of an exercise that have a matching set last time, with its values. */
function copyableSets(exercise: SessionExercise, previous: PreviousPerformance | undefined): { set: SessionSet; values: PreviousSetValues }[] {
  return exercise.sets.filter((set) => !set.completedAt).flatMap((set) => {
    const values = lastTimeFor(exercise, set, previous);
    return values ? [{ set, values }] : [];
  });
}

/** What each round of the running EMOM saved, in order: its exercise's working sets completed since round 1 began. */
function emomDoneValues(exercise: SessionExercise | null, plan: EmomPlan): number[] {
  if (!exercise) return [];
  const since = firstRoundStart(plan);
  return groupSets(exercise.sets)
    .filter((group) => group[0].kind === 'working' && group[0].completedAt && new Date(group[0].completedAt).getTime() >= since)
    .sort((a, b) => new Date(a[0].completedAt!).getTime() - new Date(b[0].completedAt!).getTime())
    .map((group) => (plan.field === 'durationSec' ? group[0].durationSec : group[0].reps) ?? 0);
}

/** "Round 3 / 10" on the card while an EMOM runs. */
function emomBadge(phase: EmomPhase, plan: EmomPlan, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (phase.phase === 'running') return t('emom.badge', { round: phase.round, rounds: plan.rounds });
  return t('emom.badgeReady', { rounds: plan.rounds });
}

function TimerBar({ hold, restEndsAt, voiceCues, onRestEnd, onFinishHold, onExtend, onReduce, onSkip, nextName }: {
  hold: ActiveHold | null;
  /** When the running rest ends; the bar counts it down and calls onRestEnd at zero. */
  restEndsAt: number | null;
  voiceCues: boolean;
  onRestEnd: () => void;
  onFinishHold: () => void;
  onExtend: () => void;
  onReduce: () => void;
  onSkip: () => void;
  nextName?: string;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, largeText } = useTheme();
  if (hold === null && restEndsAt === null) return null;
  const holding = hold !== null;
  const countingDown = hold?.phase.phase === 'countdown';
  const label = !hold
    ? nextName ? t('liveWorkout.restingNext', { name: nextName }) : t('logger.resting')
    : countingDown
      ? t('logger.getReady')
      : hold.mode === 'target'
        ? t('logger.holdingTarget', { time: formatClock(hold.targetSec) })
        : t('logger.holding');
  return (
    <View style={[styles.timerBar, { backgroundColor: palette.hero }]}>
      <View style={[styles.timerInner, !largeText && styles.timerInnerLine]}>
      <View style={styles.timerReadout}>
        <Text numberOfLines={largeText ? undefined : 2} style={[styles.timerLabel, { color: palette.heroText }]}>{label}</Text>
        {hold || restEndsAt === null
          ? <Text style={[styles.timerValue, { color: palette.heroText }]}>{hold ? holdDisplay(hold) : ''}</Text>
          : <RestCountdown key={restEndsAt} endsAt={restEndsAt} voiceCues={voiceCues} onEnd={onRestEnd} />}
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

function RestCountdown({ endsAt, voiceCues, onEnd }: { endsAt: number; voiceCues: boolean; onEnd: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  const latest = useRef({ onEnd, voiceCues });
  useEffect(() => { latest.current = { onEnd, voiceCues }; });
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (remaining === 0) {
        clearInterval(timer);
        AccessibilityInfo.announceForAccessibility(t('workout.restDoneTitle'));
        latest.current.onEnd();
        return;
      }
      if (remaining === 10) AccessibilityInfo.announceForAccessibility(t('workout.restTenLeft'));
      if (latest.current.voiceCues && (remaining === 10 || remaining === 3 || remaining === 2 || remaining === 1)) {
        const language = i18n.resolvedLanguage === 'it' ? 'it-IT' : 'en-US';
        Speech.speak(remaining === 1 ? t('workout.restLastSecond') : String(remaining), { language, rate: 0.95 });
      }
      setSeconds(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt, i18n.resolvedLanguage, t]);
  return <Text style={[styles.timerValue, { color: palette.heroText }]}>{formatClock(seconds)}</Text>;
}

function TimerAction({ label, filled = false, accessibilityLabel, onPress }: { label: string; filled?: boolean; accessibilityLabel?: string; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.timerAction, { backgroundColor: filled ? palette.heroText : palette.heroOverlay, opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={[styles.timerActionText, { color: filled ? palette.hero : palette.heroText }]}>{label}</Text>
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
  // The blocks of the lower dock (panel, main action, rails, timer) never touch: one step of the spacing scale between them.
  overStage: { zIndex: 30, elevation: 30 },
  dockStack: { gap: 8 },
  workoutColumn: { gap: 13 },
  footerStacked: { flexDirection: 'column', alignItems: 'stretch' },
  plannedRest: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minHeight: 64, borderWidth: 1, borderRadius: 4 },
  plannedLabel: { fontSize: 12 },
  plannedValue: { fontFamily: fonts.monoBold, fontSize: 27, lineHeight: 31 },
  exerciseNavigation: { flexDirection: 'row', justifyContent: 'space-between' },
  railsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  rail: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 4 },
  railLabel: { fontFamily: fonts.semibold, fontSize: 13, flexShrink: 1 },
  readyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  root: { flex: 1 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  readinessTitle: { fontFamily: fonts.medium, fontSize: 15 },
  readinessHint: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  readinessCard: { gap: 10, marginTop: -10 },
  readinessRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  readinessLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  readinessOptions: { flexDirection: 'row', gap: 6 },
  readinessOption: { width: 44, height: MIN_TOUCH_TARGET, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  readinessValue: { fontFamily: fonts.display, fontSize: 18 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  timerBar: { borderRadius: instrument.radius, paddingHorizontal: 8, paddingVertical: 6 },
  timerInner: { width: '100%', maxWidth: 640, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  timerLabel: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 14, opacity: 0.85 },
  timerValue: { fontFamily: fonts.monoBold, fontSize: 24, lineHeight: 28, fontVariant: ['tabular-nums'] },
  timerInnerLine: { flexWrap: 'nowrap' },
  timerReadout: { flexGrow: 1, flexShrink: 1, minWidth: 85 },
  timerActions: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  // No wrapping here: a wrapping column lays the two rows side by side and squeezes the labels to nothing.
  timerAction: { minWidth: 44, minHeight: 40, borderRadius: instrument.radius, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  timerActionText: { fontFamily: fonts.semibold, fontSize: 12 },
});
