import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { DEFAULT_PREP_SEC, estimateRoutineSeconds, type MobilityStep } from '../../../src/domain/mobilityPlan';
import { ExercisePicker } from '../../../src/features/exercises/ExercisePicker';
import { listExercises } from '../../../src/features/exercises/repository';
import { deleteMobilityRoutine, getMobilityRoutine, listMobilityRoutines, newStep, saveMobilityRoutine } from '../../../src/features/mobility/routines';
import {
  ActionButton,
  Body,
  Card,
  Chip,
  EmptyState,
  FooterAction,
  IconButton,
  PageHeading,
  Screen,
  SectionTitle,
  SegmentedControl,
  Sheet,
  Stepper,
  SwitchRow,
  Text,
  TextField,
} from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { goBack } from '../../../src/shared/navigation/goBack';
import * as Crypto from 'expo-crypto';
import { prescriptionsFromSteps } from '../../../src/domain/mobilityImport';
import { startPrescribedWorkout } from '../../../src/features/programs/startUserSession';
import { getActiveWorkout } from '../../../src/features/session/repository';
import { WorkoutInProgressSheet } from '../../../src/features/session/WorkoutInProgressSheet';
import { useSaveOnLeave } from '../../../src/shared/forms/useSaveOnLeave';
import { DurationField, HoldDurationField } from '../../../src/shared/components/DateTimePickers';
import { formatClock } from '../../../src/shared/utils/format';

type ExerciseInfo = { name: string; metric: string };

/** The most drills a routine can hold (see the routine schema). */
const MAX_STEPS = 40;
const AUTOSAVE_MS = 1500;
const TOAST_MS = 5000;

export default function RoutineBuilderScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [loaded, setLoaded] = useState(isNew);
  const [name, setName] = useState('');
  const [transitionSec, setTransitionSec] = useState(10);
  const [prepSec, setPrepSec] = useState(DEFAULT_PREP_SEC);
  const [steps, setSteps] = useState<MobilityStep[]>([]);
  const [exerciseInfo, setExerciseInfo] = useState<Map<string, ExerciseInfo>>(new Map());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set while leaving with an incomplete routine: confirming drops the edits and goes on.
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [discardResume, setDiscardResume] = useState<(() => void) | null>(null);
  const [favourite, setFavourite] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<{ stepId: string; name: string } | null>(null);
  const [recent, setRecent] = useState<MobilityStep[]>([]);
  // The id once stored, so a routine that started as "new" is saved in place from then on.
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id);
  const idRef = useRef<string | null>(isNew ? null : id);
  // Saves run one after another, so autosave and Start can never create the routine twice.
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ name: '', favourite: false, transitionSec: 10, prepSec: DEFAULT_PREP_SEC, steps: [] }));
  const snapshot = JSON.stringify({ name, favourite, transitionSec, prepSec, steps });
  const dirty = loaded && snapshot !== savedSnapshot;
  const atLimit = steps.length >= MAX_STEPS;

  // Exercise names are reloaded on focus so drills created from the picker show up by name.
  useFocusEffect(useCallback(() => {
    let mounted = true;
    void (async () => {
      const exercises = await listExercises();
      if (!mounted) return;
      setExerciseInfo(new Map(exercises.map((exercise) => [exercise.id, { name: exercise.name, metric: exercise.metric }])));
      // Drills used in other routines come back as one-tap chips, with the settings last used.
      const seen = new Set<string>();
      const used = (await listMobilityRoutines()).flatMap((routine) => routine.steps).filter((step) => !seen.has(step.exerciseId) && seen.add(step.exerciseId));
      if (mounted) setRecent(used.slice(0, 8));
      if (!isNew && !loaded) {
        const routine = await getMobilityRoutine(id);
        if (!mounted) return;
        if (routine) {
          setName(routine.name);
          setTransitionSec(routine.transitionSec);
          setPrepSec(routine.prepSec);
          setSteps(routine.steps);
          setFavourite(routine.favourite);
          setSavedSnapshot(JSON.stringify({ name: routine.name, favourite: routine.favourite, transitionSec: routine.transitionSec, prepSec: routine.prepSec, steps: routine.steps }));
        }
        setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, [id, isNew, loaded]));

  const updateStep = (stepId: string, patch: Partial<MobilityStep>) => {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  };
  const duplicateStep = (index: number) => {
    if (atLimit) { setError(t('mobilityHub.limitReached')); return; }
    const copy = { ...steps[index], id: newStep(steps[index].exerciseId, steps[index].mode).id };
    setSteps((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    setExpanded(copy.id);
  };
  const moveStep = (index: number, delta: number) => {
    setSteps((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  };

  const addDrill = (exerciseId: string, mode: MobilityStep['mode'], template?: MobilityStep) => {
    if (atLimit) { setError(t('mobilityHub.limitReached')); return; }
    const step = template ? { ...template, id: newStep(exerciseId, mode).id } : newStep(exerciseId, mode);
    setSteps((current) => [...current, step]);
    setExpanded(template ? null : step.id);
    setLastAdded({ stepId: step.id, name: exerciseInfo.get(exerciseId)?.name ?? '' });
    setError(null);
  };

  /** Stores the routine; false while it still lacks a drill (a missing name becomes the first drill's name) or when saving fails. */
  const persist = (): Promise<boolean> => {
    const job = queue.current.catch(() => false).then(async () => {
      const title = name.trim() || (steps[0] ? exerciseInfo.get(steps[0].exerciseId)?.name.slice(0, 60) ?? '' : '');
      if (!title || steps.length === 0) return false;
      setSaveState('saving');
      try {
        const saved = await saveMobilityRoutine({ id: idRef.current ?? undefined, name: title, transitionSec, prepSec, steps, favourite });
        idRef.current = saved.id;
        setSavedId(saved.id);
        if (!name.trim()) setName(title);
        setSavedSnapshot(JSON.stringify({ name: title, favourite, transitionSec, prepSec, steps }));
        setSaveState('idle');
        return true;
      } catch {
        setSaveState('error');
        return false;
      }
    });
    queue.current = job;
    return job;
  };
  // Saves by itself after a pause in editing, once the routine has a drill.
  const latestPersist = useRef(persist);
  useEffect(() => { latestPersist.current = persist; });
  useEffect(() => {
    if (!dirty || steps.length === 0) return;
    const timer = setTimeout(() => { void latestPersist.current(); }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, snapshot, steps.length]);
  // The "added" message fades by itself.
  useEffect(() => {
    if (!lastAdded) return;
    const timer = setTimeout(() => setLastAdded(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [lastAdded]);
  const { allowLeave } = useSaveOnLeave({
    dirty,
    save: persist,
    onInvalid: (resume) => setDiscardResume(() => resume),
  });
  const start = async (voice: boolean) => {
    if (!(await persist()) || !idRef.current) { setError(steps.length === 0 ? t('mobilityHub.needsDrill') : t('mobilityHub.saveError')); return; }
    router.push({ pathname: '/mobility/play/[id]', params: { id: idRef.current, voice: voice ? '1' : '0' } });
  };

  /** Saves, then opens the routine as a regular workout with its sets prefilled. */
  const startAsWorkout = async () => {
    if (!(await persist()) || !idRef.current) { setError(steps.length === 0 ? t('mobilityHub.needsDrill') : t('mobilityHub.saveError')); return; }
    try {
      const open = await getActiveWorkout();
      if (open) { setBlockedBy({ id: open.id, name: open.name }); return; }
      const workoutId = await startPrescribedWorkout(name.trim() || t('mobility.builderTitle'), prescriptionsFromSteps(steps, () => Crypto.randomUUID()));
      router.push({ pathname: '/workout/[id]', params: { id: workoutId } });
    } catch {
      setError(t('startFrom.error'));
    }
  };

  const drillSummary = (step: MobilityStep) => [
    step.mode === 'hold' ? t('mobilityHub.drillSummaryHold', { value: step.seconds }) : t('mobilityHub.drillSummaryReps', { value: step.reps }),
    t('mobilityHub.drillSummaryRounds', { count: step.rounds }),
    step.perSide ? t('mobilityHub.drillSummarySides') : null,
  ].filter(Boolean).join(' · ');
  const inRoutine = useMemo(() => new Set(steps.map((step) => step.exerciseId)), [steps]);
  const suggestions = recent.filter((step) => !inRoutine.has(step.exerciseId) && exerciseInfo.has(step.exerciseId)).slice(0, 4);

  if (!loaded) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;

  const minutes = Math.max(1, Math.round(estimateRoutineSeconds({ transitionSec, prepSec, steps }) / 60));
  return (
    <Screen footer={steps.length > 0 ? (
      <>
        <FooterAction icon="play" label={t('mobilityHub.startNarrated')} onPress={() => void start(true)} />
        <FooterAction icon="barbell-outline" secondary label={t('mobilityHub.startAsWorkoutShort')} onPress={() => void startAsWorkout()} />
      </>
    ) : undefined}>
      <PageHeading title={isNew && !name ? t('mobility.builderNew') : name || t('mobility.builderTitle')} subtitle={steps.length ? `${t('mobility.estimated', { count: minutes })}${saveState === 'saving' ? ` · ${t('mobilityHub.saving')}` : saveState === 'error' ? ` · ${t('mobilityHub.saveError')}` : dirty ? '' : ` · ${t('mobilityHub.saved')}`}` : undefined}
        action={<IconButton icon={favourite ? 'star' : 'star-outline'} tone="plain" size={48} color={favourite ? palette.record : palette.textMuted} label={favourite ? t('mobilityHub.unfavourite') : t('mobilityHub.favourite')} onPress={() => setFavourite((value) => !value)} />}
      />
      <TextField label={t('mobility.name')} value={name} onChangeText={(value) => { setName(value); setError(null); }} placeholder={t('mobility.namePlaceholder')} maxLength={60} />
      <Card style={styles.transitionCard}>
        <DurationField label={t('mobility.prep')} value={prepSec} format={(seconds) => seconds === 0 ? t('mobility.prepOff') : formatClock(seconds)} step={1} min={0} max={30} presets={[0, 3, 5, 10]} onChange={setPrepSec} />
        <Body style={styles.prepHint}>{t('mobility.prepHint')}</Body>
        <DurationField label={t('mobility.transition')} value={transitionSec} format={formatClock} step={5} min={0} max={60} presets={[0, 5, 10, 15]} onChange={setTransitionSec} />
      </Card>

      <SectionTitle title={`${t('mobility.drillsTitle')} · ${steps.length}/${MAX_STEPS}`} />
      {suggestions.length > 0 && !atLimit ? (
        <View style={styles.chips}>
          {suggestions.map((step) => (
            <Chip key={step.exerciseId} icon="add" label={exerciseInfo.get(step.exerciseId)?.name ?? ''} onPress={() => addDrill(step.exerciseId, step.mode, step)} />
          ))}
        </View>
      ) : null}
      {steps.length === 0 ? (
        <EmptyState icon="list-outline" title={t('mobility.addDrill')} body={t('mobility.emptyBody')} />
      ) : null}
      {steps.map((step, index) => (
        <Card key={step.id} style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepNumber, { backgroundColor: palette.accentSoft }]}>
              <Text style={[styles.stepNumberText, { color: palette.accentStrong }]}>{index + 1}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: expanded === step.id }}
              accessibilityLabel={t(expanded === step.id ? 'mobilityHub.collapse' : 'mobilityHub.expand', { name: exerciseInfo.get(step.exerciseId)?.name ?? '' })}
              onPress={() => setExpanded(expanded === step.id ? null : step.id)}
              style={styles.stepTitle}
            >
              <Text style={styles.stepName} numberOfLines={2}>{exerciseInfo.get(step.exerciseId)?.name ?? '…'}</Text>
              {expanded === step.id ? null : <Text style={[styles.stepSummary, { color: palette.textMuted }]}>{drillSummary(step)}</Text>}
            </Pressable>
            <IconButton icon="chevron-up" label={t('mobility.moveUp')} tone="plain" size={34} onPress={() => { if (index > 0) moveStep(index, -1); }} />
            <IconButton icon="chevron-down" label={t('mobility.moveDown')} tone="plain" size={34} onPress={() => { if (index < steps.length - 1) moveStep(index, 1); }} />
            <IconButton icon="copy-outline" label={t('mobilityHub.duplicateDrill')} tone="plain" size={34} onPress={() => duplicateStep(index)} />
            <IconButton icon="trash-outline" label={t('mobility.removeDrill')} tone="plain" size={34} onPress={() => setSteps((current) => current.filter((item) => item.id !== step.id))} />
          </View>
          {expanded === step.id ? <>
          <SegmentedControl
            value={step.mode}
            onChange={(mode) => updateStep(step.id, { mode })}
            options={[{ value: 'hold', label: t('mobility.hold') }, { value: 'reps', label: t('mobility.reps') }]}
          />
          <View style={styles.steppers}>
            {step.mode === 'hold' ? (
              <HoldDurationField label={t('mobility.hold')} value={step.seconds} min={5} max={600} onChange={(seconds) => updateStep(step.id, { seconds })} />
            ) : (
              <Stepper layout="row" label={t('mobility.reps')} value={step.reps} step={1} min={1} max={100} onChange={(reps) => updateStep(step.id, { reps })} />
            )}
            <Stepper layout="row" label={t('mobility.rounds')} value={step.rounds} step={1} min={1} max={10} onChange={(rounds) => updateStep(step.id, { rounds })} />
            <DurationField label={t('mobility.rest')} value={step.restSec} format={formatClock} step={5} min={0} max={300} presets={[0, 15, 30, 60]} onChange={(restSec) => updateStep(step.id, { restSec })} />
          </View>
          <View style={[styles.sideRow, { borderTopColor: palette.border }]}>
            <SwitchRow title={t('mobility.perSide')} value={step.perSide} onChange={(perSide) => updateStep(step.id, { perSide })} />
          </View>
          </> : null}
        </Card>
      ))}
      <ActionButton icon="add" label={t('mobility.addDrill')} secondary disabled={atLimit} onPress={() => setPickerOpen(true)} />

      {lastAdded && steps.some((step) => step.id === lastAdded.stepId) ? (
        <View style={[styles.toast, { backgroundColor: palette.successSoft }]} accessibilityLiveRegion="polite">
          <Text style={[styles.toastText, { color: palette.success }]}>{t('mobilityHub.added', { name: lastAdded.name })}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setSteps((current) => current.filter((step) => step.id !== lastAdded.stepId)); setLastAdded(null); }} style={styles.toastAction}>
            <Text style={styles.toastUndo}>{t('mobilityHub.undo')}</Text>
          </Pressable>
        </View>
      ) : null}
      {saveState === 'error' ? <ActionButton icon="refresh" secondary label={t('mobilityHub.retry')} onPress={() => void persist()} /> : null}
      {error ? <Text style={[styles.error, { color: palette.warning }]}>{error}</Text> : null}
      {savedId === null ? null : <ActionButton icon="trash-outline" label={t('mobility.delete')} variant="danger" onPress={() => setConfirmDelete(true)} />}

      <ExercisePicker
        visible={pickerOpen}
        title={t('mobility.pickDrill')}
        initialCategory="mobility"
        onChoose={(choice) => {
          setPickerOpen(false);
          setError(null);
          addDrill(choice.id, choice.metric === 'time' || choice.metric === 'time_load' ? 'hold' : 'reps');
        }}
        onCreate={(name) => { setPickerOpen(false); router.push({ pathname: '/exercise/new', params: name ? { name } : {} }); }}
        onClose={() => setPickerOpen(false)}
      />

      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
      <Sheet visible={discardResume !== null} onClose={() => setDiscardResume(null)} title={t('mobility.invalid')}>
        <ActionButton label={t('logger.keepGoing')} secondary onPress={() => setDiscardResume(null)} />
        <ActionButton label={t('mobility.endDiscard')} variant="danger" onPress={() => { const resume = discardResume; setDiscardResume(null); resume?.(); }} />
      </Sheet>
      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('mobility.delete')} body={t('mobility.deleteBody')}>
        <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => { allowLeave(); void deleteMobilityRoutine(savedId ?? id).then(() => goBack('/mobility')); }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1 },
  transitionCard: { paddingVertical: 8 },
  prepHint: { fontSize: 13, lineHeight: 18, marginTop: -4 },
  stepCard: { gap: 16, paddingBottom: 12 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepNumber: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  stepNumberText: { fontFamily: fonts.display, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepTitle: { flex: 1, minHeight: 48, justifyContent: 'center' },
  stepSummary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 16, paddingRight: 4, minHeight: 48 },
  toastText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  toastAction: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' },
  toastUndo: { fontFamily: fonts.semibold, fontSize: 15 },
  stepName: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  steppers: { gap: 2 },
  sideRow: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: -16 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
