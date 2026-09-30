import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ExercisePicker, type ExerciseChoice } from '../../../src/features/exercises/ExercisePicker';
import { openExercisePage } from '../../../src/features/exercises/openExercise';
import {
  addExerciseToCompletedWorkout,
  addSetToCompletedWorkout,
  deleteWorkout,
  getCompletedWorkout,
  moveExerciseEntry,
  removeExerciseEntry,
  removeExerciseEntryWithUndo,
  removeSet,
  removeSetWithUndo,
  restoreRemoved,
  setCompletedWorkoutSetDone,
  updateCompletedWorkoutDetails,
  updateCompletedWorkoutSet,
  updateSetNote,
  repeatWorkoutIfIdle,
  updateSetRpe,
  WORKOUT_NAME_MAX,
} from '../../../src/features/session/repository';
import { SaveToProgramSheet } from '../../../src/features/programs/SaveToProgramSheet';
import { WorkoutInProgressSheet } from '../../../src/features/session/WorkoutInProgressSheet';
import type { CompletedWorkout, RemovedRows, SessionExercise, SessionSet } from '../../../src/features/session/repository';
import { RpePicker } from '../../../src/features/session/RpePicker';
import { ExerciseNoteField } from '../../../src/features/session/ExerciseNoteField';
import { getWorkoutMobilitySeconds } from '../../../src/features/analytics/repository';
import { formatMinutes } from '../../../src/shared/utils/format';
import { formatRpe } from '../../../src/domain/rpe';
import { ActionButton, Body, Card, Heading, Icon, IconButton, Label, NumberEdit, PageHeading, Screen, Sheet, Stepper, tapFeedback, Text, TextField, Toast } from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { DateField, TimeField } from '../../../src/shared/components/DateTimePickers';
import { ReorderableList } from '../../../src/shared/components/ReorderableList';
import { goBack } from '../../../src/shared/navigation/goBack';

type SetTarget = { exercise: SessionExercise; set: SessionSet };

export default function PastWorkoutScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id, edit: openDetails } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobilitySeconds, setMobilitySeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [setFor, setSetFor] = useState<SetTarget | null>(null);
  const [exerciseFor, setExerciseFor] = useState<SessionExercise | null>(null);
  // A just-created past workout opens on its details, so its day and time are set first.
  const [detailsOpen, setDetailsOpen] = useState(openDetails === '1');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  // The last removal, offered for a few seconds as "Restore".
  const [undo, setUndo] = useState<{ message: string; removed: RemovedRows } | null>(null);
  const hideUndo = useCallback(() => setUndo(null), []);

  const refresh = useCallback(async () => {
    try {
      const [completed, mobility] = await Promise.all([getCompletedWorkout(id), getWorkoutMobilitySeconds(id)]);
      setWorkout(completed);
      setMobilitySeconds(mobility);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Reloads on focus so clips added on the form-check screen show up when returning.
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  /** Runs an edit, then reloads; a failure shows one message instead of losing the screen. */
  const edit = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);
    } catch {
      setError(t('history.saveError'));
    }
    await refresh();
  };

  const adjust = (setId: string, field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg', value: number) =>
    edit(() => updateCompletedWorkoutSet(id, setId, field, value));

  const chooseExercise = (choice: ExerciseChoice) => {
    setPickerOpen(false);
    void edit(() => addExerciseToCompletedWorkout(id, choice.id));
  };

  const confirmDelete = async () => {
    setDeleteOpen(false);
    try {
      await deleteWorkout(id);
      // Screens below (e.g. the workout summary) still show the deleted workout, so leave them all.
      if (router.canDismiss()) router.dismissAll();
      router.navigate('/(tabs)/log');
    } catch {
      setError(t('history.deleteError'));
    }
  };

  if (loading) return <Screen><PageHeading title={t('history.title')} subtitle={t('history.loading')} /></Screen>;
  if (loadError) return <Screen><PageHeading title={t('history.title')} subtitle={t('history.loadError')} /><ActionButton label={t('history.retry')} onPress={() => { setLoading(true); void refresh(); }} /><ActionButton label={t('history.back')} secondary onPress={() => goBack('/(tabs)/log')} /></Screen>;
  if (!workout) return <Screen><PageHeading title={t('history.unavailable')} subtitle={t('history.unavailableBody')} /><ActionButton label={t('history.back')} onPress={() => goBack('/(tabs)/log')} /></Screen>;

  const duration = Math.max(0, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));
  const locale = i18n.language.startsWith('it') ? 'it-IT' : 'en-US';
  const completedSets = workout.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.completedAt).length, 0);
  const liveSet = setFor ? workout.exercises.find((item) => item.entryId === setFor.exercise.entryId)?.sets.find((item) => item.id === setFor.set.id) : undefined;

  return (
    <Screen
      overlay={(
        <Toast
          message={undo?.message ?? null}
          actionLabel={t('logger.restore')}
          onAction={() => { const removed = undo?.removed; if (removed) void edit(() => restoreRemoved(removed)); }}
          onHide={hideUndo}
        />
      )}
    >
      <PageHeading
        title={workout.name}
        subtitle={t('history.subtitle', {
          date: workout.startedAt.toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          duration,
          unit: t('history.minutes'),
          status: t('history.completed'),
        })}
        action={<IconButton icon="create-outline" tone="accent" label={t('history.editDetails')} onPress={() => setDetailsOpen(true)} />}
      />
      {mobilitySeconds > 0 ? (
        <View style={[styles.mobility, { backgroundColor: palette.accentSoft }]}>
          <Icon name="body-outline" size={16} color={palette.accentStrong} />
          <Text style={[styles.mobilityText, { color: palette.accentStrong }]}>{t('mobilityStats.workoutLine', { time: formatMinutes(mobilitySeconds) })}</Text>
        </View>
      ) : null}
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
      <ActionButton icon="repeat" label={t('history.repeat')} onPress={() => void repeatWorkoutIfIdle(id).then((result) => {
        if ('workoutId' in result) router.push({ pathname: '/workout/[id]', params: { id: result.workoutId } });
        else setBlockedBy(result.active);
      }).catch(() => setError(t('history.repeatError')))} />
      <ActionButton icon="bookmark-outline" label={t('saveToProgram.action')} secondary onPress={() => setSaveOpen(true)} />
      <ActionButton icon="share-social-outline" label={t('shareCard.action')} secondary onPress={() => router.push({ pathname: '/workout/share/[id]', params: { id } })} />
      <Body>{t('history.editHelp')}</Body>
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: palette.warning }]}>{error}</Text> : null}

      <ReorderableList
        items={workout.exercises}
        keyOf={(item) => item.entryId}
        nameOf={(item) => item.name}
        gap={20}
        onMove={(from, to) => void edit(() => moveExerciseEntry(id, workout.exercises[from].entryId, to))}
        renderRow={(exercise, _index, row) => {
        const timed = exercise.metric === 'time' || exercise.metric === 'time_load';
        const distance = exercise.metric === 'distance';
        const loaded = exercise.metric === 'reps_load' || exercise.metric === 'time_load';
        const metricField = timed ? 'durationSec' : distance ? 'distanceM' : 'reps';
        const step = distance ? 0.1 : timed ? 5 : 1;
        const unit = timed ? t('history.units.seconds') : distance ? t('history.units.meters') : t('history.units.reps');
        return (
          <Card key={exercise.entryId} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              {row.handle}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={exercise.name}
                accessibilityHint={t('logger.openExerciseHint')}
                onLongPress={() => openExercisePage(exercise.exerciseId)}
                accessibilityActions={[{ name: 'longpress', label: t('logger.openExercise') }]}
                onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') openExercisePage(exercise.exerciseId); }}
                style={styles.flex}
              >
                <Label>{t(`metric.${exercise.metric}`)}</Label>
                <Heading>{exercise.name}</Heading>
                {exercise.notes ? <Text numberOfLines={3} style={[styles.exerciseNote, { color: palette.textMuted }]}>{exercise.notes}</Text> : null}
              </Pressable>
              <IconButton icon="ellipsis-horizontal" tone="plain" label={t('logger.options')} onPress={() => setExerciseFor(exercise)} />
            </View>
            {exercise.sets.map((set) => {
              const value = timed ? set.durationSec ?? 0 : distance ? set.distanceM ?? 0 : set.reps ?? 0;
              const done = Boolean(set.completedAt);
              return (
                <View key={set.id} style={[styles.setBlock, { borderColor: palette.border }]}>
                  <View style={styles.row}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                      accessibilityLabel={t('history.toggleDone', { number: set.index })}
                      onPress={() => { tapFeedback(); void edit(() => setCompletedWorkoutSetDone(id, set.id, !done)); }}
                      style={styles.setMeta}
                    >
                      <View style={[styles.setBadge, { backgroundColor: done ? palette.accent : palette.surfaceMuted }]}>
                        {done ? <Icon name="checkmark" size={16} color={palette.accentText} /> : <Text style={[styles.setBadgeText, { color: palette.text }]}>{set.index}</Text>}
                      </View>
                      <Text style={[styles.setStatus, { color: done ? palette.accentStrong : palette.textMuted }]}>{done ? t('history.setCompleted') : t('history.setIncomplete')}</Text>
                    </Pressable>
                    <View style={styles.counter}>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('history.decrease', { unit })} hitSlop={4} onPress={() => void adjust(set.id, metricField, Math.max(0, Math.round((value - step) * 100) / 100))} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Icon name="remove" size={16} color={palette.text} /></Pressable>
                      <NumberEdit
                        value={value}
                        display={`${value} ${unit}`}
                        label={t('logger.editValue', { number: set.index })}
                        onCommit={(next) => void adjust(set.id, metricField, distance ? Math.round(next * 100) / 100 : Math.round(next))}
                        style={[styles.value, { color: palette.text }]}
                      />
                      <Pressable accessibilityRole="button" accessibilityLabel={t('history.increase', { unit })} hitSlop={4} onPress={() => void adjust(set.id, metricField, Math.round((value + step) * 100) / 100)} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Icon name="add" size={16} color={palette.text} /></Pressable>
                    </View>
                    {loaded ? <LoadEditor key={`${set.id}-${set.addedLoadKg}`} value={set.addedLoadKg} onSave={(next) => void adjust(set.id, 'addedLoadKg', next)} /> : null}
                    <IconButton icon="ellipsis-vertical" tone="plain" size={36} label={t('logger.setOptions', { number: set.index })} onPress={() => setSetFor({ exercise, set })} />
                  </View>
                  {set.note || set.rpe !== null || set.clipCount > 0 ? (
                    <Pressable accessibilityRole="button" onPress={() => setSetFor({ exercise, set })} style={styles.noteRow}>
                      {set.rpe !== null ? <Text style={[styles.noteText, styles.noteTag, { color: palette.accentStrong }]}>{t('logger.rpeTag', { value: formatRpe(set.rpe) })}</Text> : null}
                      {set.clipCount > 0 ? (
                        <View style={[styles.clipChip, { backgroundColor: palette.accentSoft }]}>
                          <Icon name="videocam" size={12} color={palette.accentStrong} />
                          <Text style={[styles.clipText, { color: palette.accentStrong }]}>{t('logger.clip', { count: set.clipCount })}</Text>
                        </View>
                      ) : null}
                      {set.note ? <Text numberOfLines={2} style={[styles.noteText, { color: palette.textMuted }]}>{set.note}</Text> : null}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              onPress={() => { tapFeedback(); void edit(() => addSetToCompletedWorkout(id, exercise.entryId)); }}
              style={({ pressed }) => [styles.addSet, { borderColor: palette.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="add" size={18} color={palette.accentStrong} />
              <Text style={[styles.addSetText, { color: palette.accentStrong }]}>{t('logger.addSet')}</Text>
            </Pressable>
          </Card>
        );
        }}
      />

      <ActionButton icon="add" label={t('workout.addExercise')} secondary onPress={() => setPickerOpen(true)} />
      <ActionButton icon="trash-outline" label={t('history.delete')} variant="danger" onPress={() => setDeleteOpen(true)} />

      {setFor && liveSet ? (
        <SetSheet
          key={liveSet.id}
          title={`${setFor.exercise.name} · ${t('logger.setTitle', { number: liveSet.index })}`}
          set={liveSet}
          onRpe={(rpe) => edit(() => updateSetRpe(liveSet.id, rpe))}
          onSaveNote={(note) => edit(() => updateSetNote(liveSet.id, note))}
          onVideo={() => { setSetFor(null); router.push({ pathname: '/form-check/[setId]', params: { setId: liveSet.id } }); }}
          onRemove={() => {
            setSetFor(null);
            // Clips cannot be brought back, so only a set without clips gets "Restore".
            if (liveSet.clipCount > 0) { void edit(() => removeSet(liveSet.id)); return; }
            void edit(async () => {
              const removed = await removeSetWithUndo(liveSet.id);
              if (removed) setUndo({ message: t('logger.removedSet', { number: liveSet.index }), removed });
            });
          }}
          onClose={() => setSetFor(null)}
        />
      ) : null}

      <ExerciseSheet
        exercise={exerciseFor}
        onClose={() => setExerciseFor(null)}
        onChanged={() => void refresh()}
        onRemove={(exercise) => {
          setExerciseFor(null);
          if (exercise.sets.some((set) => set.clipCount > 0)) { void edit(() => removeExerciseEntry(exercise.entryId)); return; }
          void edit(async () => {
            const removed = await removeExerciseEntryWithUndo(exercise.entryId);
            if (removed) setUndo({ message: t('logger.removedExercise', { name: exercise.name }), removed });
          });
        }}
      />

      {detailsOpen ? (
        <DetailsSheet
          workout={workout}
          locale={locale}
          onClose={() => setDetailsOpen(false)}
          onSave={async (details) => {
            await updateCompletedWorkoutDetails(id, details);
            setDetailsOpen(false);
            await refresh();
          }}
        />
      ) : null}

      <Sheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('history.deleteTitle', { name: workout.name })}
        body={t('history.deleteBody', { count: completedSets })}
      >
        <ActionButton icon="trash-outline" label={t('history.deleteConfirm')} variant="danger" onPress={() => void confirmDelete()} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setDeleteOpen(false)} />
      </Sheet>

      <SaveToProgramSheet
        visible={saveOpen}
        defaultName={workout.name}
        exercises={workout.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.completedAt) }))}
        onClose={() => setSaveOpen(false)}
        onSaved={(program) => { setSaveOpen(false); setSaved({ id: program.id, name: program.name }); }}
      />
      <Toast
        message={saved ? t('saveToProgram.saved', { name: saved.name }) : null}
        actionLabel={t('saveToProgram.open')}
        onAction={() => { if (saved) router.push({ pathname: '/program/user/[id]', params: { id: saved.id } }); }}
        onHide={() => setSaved(null)}
        bottomOffset={0}
      />

      <ExercisePicker
        visible={pickerOpen}
        title={t('workout.addExercise')}
        subtitle={t('history.pickerSubtitle')}
        onChoose={chooseExercise}
        onCreate={(name) => { setPickerOpen(false); router.push({ pathname: '/exercise/new', params: { addToPast: id, ...(name ? { name } : {}) } }); }}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

/** Note, RPE, clip and removal for one set; removing a set with clips asks once more first. */
function SetSheet({ title, set, onRpe, onSaveNote, onVideo, onRemove, onClose }: {
  title: string;
  set: SessionSet;
  onRpe: (rpe: number | null) => Promise<void>;
  onSaveNote: (note: string) => Promise<void>;
  onVideo: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(set.note ?? '');
  const [rpe, setRpe] = useState(set.rpe);
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    onClose();
    if ((set.note ?? '') !== note.trim()) void onSaveNote(note);
  };
  return (
    <Sheet visible onClose={close} title={title} body={confirming ? t('logger.removeCompletedWarning') : undefined}>
      {confirming ? (
        <>
          <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={onRemove} />
          <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirming(false)} />
        </>
      ) : (
        <>
          <RpePicker value={rpe} onChange={(next) => { setRpe(next); void onRpe(next); }} />
          <TextField label={t('logger.noteLabel')} value={note} onChangeText={setNote} placeholder={t('logger.notePlaceholder')} multiline maxLength={500} />
          <ActionButton
            icon={set.clipCount > 0 ? 'play-circle-outline' : 'videocam-outline'}
            label={set.clipCount > 0 ? t('logger.videoView', { count: set.clipCount }) : t('logger.videoAttach')}
            secondary
            onPress={onVideo}
          />
          <ActionButton icon="trash-outline" label={t('logger.removeSet')} variant="danger" onPress={() => (set.clipCount > 0 ? setConfirming(true) : onRemove())} />
          <ActionButton label={t('logger.done')} onPress={close} />
        </>
      )}
    </Sheet>
  );
}

function ExerciseSheet({ exercise, onClose, onChanged, onRemove }: { exercise: SessionExercise | null; onClose: () => void; onChanged: () => void; onRemove: (exercise: SessionExercise) => void }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const close = () => { setConfirming(false); onClose(); };
  return (
    <Sheet
      visible={exercise !== null}
      onClose={close}
      title={confirming ? t('logger.removeExerciseTitle', { name: exercise?.name ?? '' }) : exercise?.name ?? t('logger.options')}
      body={confirming ? t('logger.removeExerciseBody', { count: exercise?.sets.length ?? 0 }) : undefined}
    >
      {confirming ? (
        <>
          <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => { setConfirming(false); if (exercise) onRemove(exercise); }} />
          <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirming(false)} />
        </>
      ) : (
        <>
          {exercise ? <ExerciseNoteField key={exercise.entryId} entryId={exercise.entryId} initial={exercise.notes} onSaved={onChanged} /> : null}
          <ActionButton
            icon="construct-outline"
            label={t('logger.editExercise')}
            secondary
            onPress={() => {
              if (!exercise) return;
              const exerciseId = exercise.exerciseId;
              close();
              router.push({ pathname: '/exercise/new', params: { edit: exerciseId } });
            }}
          />
          <ActionButton icon="trash-outline" label={t('logger.removeExercise')} variant="danger" onPress={() => {
            if (exercise?.sets.some((set) => set.clipCount > 0)) setConfirming(true);
            else if (exercise) onRemove(exercise);
          }} />
          <ActionButton label={t('common.cancel')} secondary onPress={close} />
        </>
      )}
    </Sheet>
  );
}


/** Name, day, start time and length of a finished workout, edited with steppers. */
function DetailsSheet({ workout, locale, onClose, onSave }: {
  workout: CompletedWorkout;
  locale: string;
  onClose: () => void;
  onSave: (details: { name: string; startedAt: Date; endedAt: Date }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(workout.name);
  const [start, setStart] = useState(workout.startedAt.getTime());
  const [minutes, setMinutes] = useState(Math.max(1, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000)));
  const [error, setError] = useState<string | null>(null);
  const startDate = new Date(start);

  const save = async () => {
    if (!name.trim()) { setError(t('history.nameRequired')); return; }
    const startedAt = new Date(start);
    if (startedAt.getTime() > Date.now()) { setError(t('history.futureStart')); return; }
    try {
      await onSave({ name, startedAt, endedAt: new Date(start + minutes * 60_000) });
    } catch {
      setError(t('history.saveError'));
    }
  };

  return (
    <Sheet visible onClose={onClose} title={t('history.editDetails')}>
      <TextField label={t('history.name')} value={name} onChangeText={(value) => { setName(value); setError(null); }} maxLength={WORKOUT_NAME_MAX} />
      <DateField label={t('history.day')} value={startDate} locale={locale} maxDate={new Date()} onChange={(next) => { setStart(next.getTime()); setError(null); }} />
      <TimeField
        label={t('history.startTime')}
        hour={startDate.getHours()}
        minute={startDate.getMinutes()}
        locale={locale}
        onChange={(hour, minute) => { const next = new Date(start); next.setHours(hour, minute, 0, 0); setStart(next.getTime()); setError(null); }}
      />
      <Stepper layout="row" label={t('history.duration')} value={minutes} display={t('history.durationValue', { count: minutes })} step={5} min={1} max={600} editable presets={[30, 45, 60, 75, 90]} presetLabel={(value) => t('history.durationValue', { count: value })} onChange={setMinutes} />
      {error ? <Body accessibilityLiveRegion="polite">{error}</Body> : null}
      <ActionButton icon="checkmark" label={t('common.save')} onPress={() => void save()} />
      <ActionButton label={t('common.cancel')} secondary onPress={onClose} />
    </Sheet>
  );
}

function LoadEditor({ value, onSave }: { value: number; onSave: (value: number) => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [draft, setDraft] = useState(String(value));
  return (
    <View style={styles.loadWrap}>
      <TextInput
        accessibilityLabel={t('history.addedLoad')}
        keyboardType="numbers-and-punctuation"
        value={draft}
        onChangeText={setDraft}
        selectTextOnFocus
        onEndEditing={() => {
          const parsed = Number(draft.replace(',', '.'));
          if (draft.trim() !== '' && Number.isFinite(parsed)) onSave(parsed);
          else setDraft(String(value));
        }}
        style={[styles.loadInput, { backgroundColor: palette.surfaceMuted, color: palette.text }]}
      />
      <Text style={[styles.loadUnit, { color: palette.textMuted }]}>{t('history.units.kg')}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  mobility: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: -8 },
  mobilityText: { fontFamily: fonts.semibold, fontSize: 14 },
  flex: { flex: 1 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
  exerciseCard: { gap: 4 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  setBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingBottom: 4 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  setMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  setBadge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  setBadgeText: { fontFamily: fonts.display, fontSize: 16 },
  setStatus: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 12 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  adjust: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 58, textAlign: 'center', fontFamily: fonts.display, fontSize: 18 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingLeft: 38 },
  noteText: { flex: 1, fontFamily: fonts.body, fontSize: 13 },
  noteTag: { flex: 0, fontFamily: fonts.semibold },
  clipChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 999 },
  clipText: { fontFamily: fonts.semibold, fontSize: 12 },
  addSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', marginTop: 6 },
  addSetText: { fontFamily: fonts.semibold, fontSize: 15 },
  exerciseNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 4 },
  loadWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loadInput: { minWidth: 64, height: 38, borderRadius: 10, textAlign: 'center', textAlignVertical: 'center', fontFamily: fonts.display, fontSize: 17, lineHeight: 21, paddingVertical: 0, paddingHorizontal: 6, includeFontPadding: false },
  loadUnit: { fontFamily: fonts.medium, fontSize: 11 },
});
