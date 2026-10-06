import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ExerciseCard } from '../src/features/session/ExerciseCard';
import { ExercisePicker, type ExerciseChoice } from '../src/features/exercises/ExercisePicker';
import { WorkoutInProgressSheet } from '../src/features/session/WorkoutInProgressSheet';
import { getActiveWorkout, type SessionSet } from '../src/features/session/repository';
import { listMicroSessionExercises, listRecentMicroSessionExerciseIds, logMicroSessionItems, pickRecent } from '../src/features/session/microSession';
import { addDraftSet, doneItems, freshRound, newDraftExercise, removeDraftSet, stepDraftSet, updateDraftSet, type DraftExercise } from '../src/features/session/microDraft';
import { ActionButton, Chip, EmptyState, FooterAction, Label, PageHeading, Screen, Sheet, tapFeedback, Toast } from '../src/shared/components/ui';
import { useSaveOnLeave } from '../src/shared/forms/useSaveOnLeave';
import { readBooleanPreference, RPE_PROMPT_KEY } from '../src/shared/settings/preferences';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

type Exercise = Awaited<ReturnType<typeof listMicroSessionExercises>>[number];

/**
 * A micro-session drafted with the workout's own exercise card (sets, ✓, steppers, RPE, form,
 * swipe), kept in memory until "Log": nothing locks other workouts while it is filled in.
 */
export default function MicroSessionScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DraftExercise[]>([]);
  const draftRef = useRef<DraftExercise[]>([]);
  const [recent, setRecent] = useState<Exercise[]>([]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [setMenu, setSetMenu] = useState<SessionSet | null>(null);
  const [exerciseMenu, setExerciseMenu] = useState<DraftExercise | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [discardAsk, setDiscardAsk] = useState<(() => void) | null>(null);
  const [showRpe] = useState(() => readBooleanPreference(RPE_PROMPT_KEY, true));
  const working = useRef(false);
  const askedToPick = useRef(false);

  useEffect(() => { draftRef.current = draft; }, [draft]);

  /** Recent exercises, and the last one used added on the first open. */
  const loadBase = useCallback(async () => {
    const [all, recentIds] = await Promise.all([listMicroSessionExercises(''), listRecentMicroSessionExerciseIds(5)]);
    setRecent(pickRecent(recentIds, all, 5));
    // Nothing is chosen for you: with an empty draft the picker opens once, so the first step is choosing.
    if (draftRef.current.length === 0 && !askedToPick.current) {
      askedToPick.current = true;
      setPickerOpen(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { void loadBase(); }, [loadBase]));

  const doneCount = draft.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completedAt).length, 0);
  const included = new Set(draft.map((exercise) => exercise.exerciseId));

  const toggleExercise = (exercise: { id: string; name: string; metric: string }) => {
    tapFeedback();
    setDraft((current) => current.some((item) => item.exerciseId === exercise.id)
      ? current.filter((item) => item.exerciseId !== exercise.id)
      : [...current, newDraftExercise(exercise)]);
  };
  const change = (next: (current: DraftExercise[]) => DraftExercise[]) => setDraft(next);

  /** Logs the done sets as one micro-session; false when nothing could be saved. */
  const log = async (): Promise<boolean> => {
    const items = doneItems(draftRef.current);
    if (working.current || items.length === 0) return items.length === 0;
    working.current = true;
    try {
      const open = await getActiveWorkout();
      if (open) { setBlockedBy({ id: open.id, name: open.name }); return false; }
      await logMicroSessionItems(items);
      tapFeedback('success');
      setMessage(t('micro.done'));
      setDraft((current) => freshRound(current));
      void loadBase();
      return true;
    } catch {
      setMessage(t('micro.error'));
      return false;
    } finally {
      working.current = false;
    }
  };

  // Leaving with done sets logs them; if that fails, ask before dropping them.
  useSaveOnLeave({ dirty: doneCount > 0, save: log, onInvalid: (resume) => setDiscardAsk(() => resume) });

  return (
    <Screen
      footer={
        <>
          <FooterAction icon="add" label={t('workout.addExercise')} secondary onPress={() => setPickerOpen(true)} />
          <FooterAction icon="checkmark" label={t('micro.saveSets', { count: doneCount })} disabled={doneCount === 0} onPress={() => void log()} />
        </>
      }
      overlay={<Toast message={message} onHide={() => setMessage(null)} />}
    >
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
      <PageHeading title={t('micro.title')} subtitle={t('micro.subtitle')} />
      {recent.length > 0 ? (
        <View style={styles.recent}>
          <Label>{t('micro.recent')}</Label>
          <View style={styles.chips}>{recent.map((exercise) => <Chip key={exercise.id} label={exercise.name} selected={included.has(exercise.id)} onPress={() => toggleExercise(exercise)} />)}</View>
        </View>
      ) : null}
      {draft.length === 0 ? (
        <EmptyState icon="flash-outline" title={t('micro.emptyTitle')} body={t('micro.pickFirst')} action={<ActionButton icon="add" label={t('workout.addExercise')} onPress={() => setPickerOpen(true)} />} />
      ) : null}
      {draft.map((exercise) => (
        <ExerciseCard
          key={exercise.entryId}
          exercise={exercise}
          collapsed={collapsed.has(exercise.entryId)}
          onToggleCollapsed={() => setCollapsed((current) => {
            const next = new Set(current);
            if (!next.delete(exercise.entryId)) next.add(exercise.entryId);
            return next;
          })}
          compare={false}
          showRpe={showRpe}
          onChange={async (set, field, delta) => change((current) => stepDraftSet(current, set.id, field, delta))}
          onSetValue={(set, field, value) => change((current) => updateDraftSet(current, set.id, { [field]: value }))}
          onComplete={(set) => { tapFeedback('success'); change((current) => updateDraftSet(current, set.id, { completedAt: new Date() })); }}
          onUncomplete={(set) => { tapFeedback(); change((current) => updateDraftSet(current, set.id, { completedAt: null })); }}
          onToggleWarmup={(set) => { tapFeedback(); change((current) => updateDraftSet(current, set.id, { kind: set.kind === 'warmup' ? 'working' : 'warmup' })); }}
          onRpe={(set, rpe) => change((current) => updateDraftSet(current, set.id, { rpe }))}
          onFormRating={(set, rating) => { tapFeedback(); change((current) => updateDraftSet(current, set.id, { formRating: rating })); }}
          onAddSet={() => change((current) => addDraftSet(current, exercise.entryId))}
          onAddWarmup={() => change((current) => addDraftSet(current, exercise.entryId, 'warmup'))}
          onRemoveSet={(set) => change((current) => removeDraftSet(current, set.id))}
          onSetOptions={setSetMenu}
          onOptions={() => setExerciseMenu(exercise)}
        />
      ))}

      <Sheet visible={setMenu !== null} onClose={() => setSetMenu(null)} title={setMenu ? t('logger.setTitle', { number: setMenu.index }) : ''}>
        <ActionButton icon="trash-outline" label={t('logger.removeSet')} variant="danger" onPress={() => { const target = setMenu; setSetMenu(null); if (target) change((current) => removeDraftSet(current, target.id)); }} />
        <ActionButton label={t('logger.done')} secondary onPress={() => setSetMenu(null)} />
      </Sheet>
      <Sheet visible={exerciseMenu !== null} onClose={() => setExerciseMenu(null)} title={exerciseMenu?.name ?? ''}>
        <ActionButton icon="trash-outline" label={t('logger.removeExercise')} variant="danger" onPress={() => { const target = exerciseMenu; setExerciseMenu(null); if (target) change((current) => current.filter((item) => item.entryId !== target.entryId)); }} />
        <ActionButton label={t('logger.done')} secondary onPress={() => setExerciseMenu(null)} />
      </Sheet>
      <Sheet visible={discardAsk !== null} onClose={() => setDiscardAsk(null)} title={t('micro.discardTitle')} body={t('micro.discardBody', { count: doneCount })}>
        <ActionButton icon="trash-outline" label={t('micro.discard')} variant="danger" onPress={() => { const resume = discardAsk; setDiscardAsk(null); resume?.(); }} />
        <ActionButton label={t('logger.keepGoing')} secondary onPress={() => setDiscardAsk(null)} />
      </Sheet>
      <ExercisePicker
        visible={pickerOpen}
        title={t('workout.addExercise')}
        subtitle={t('micro.subtitle')}
        include={(choice: ExerciseChoice) => !included.has(choice.id)}
        onChoose={(choice) => { setPickerOpen(false); toggleExercise(choice); }}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  recent: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
