import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSaveOnLeave } from '../src/shared/forms/useSaveOnLeave';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  duplicateSession,
  estimateSessionSeconds,
  DEFAULT_TARGET_FOR,
  fitRpePerSet,
  isLoadMetric,
  isTimedMetric,
  moveItem,
  NOTE_MAX,
  newPrescription,
  replaceExercise,
  sessionSetCount,
  validateUserProgram,
  type ProgramError,
  type UserProgramExercise,
  type UserProgramSession,
} from '../src/domain/userProgram';
import { DurationField, HoldDurationField } from '../src/shared/components/DateTimePickers';
import { ReorderableList } from '../src/shared/components/ReorderableList';
import { ExercisePicker } from '../src/features/exercises/ExercisePicker';
import { openExercisePage } from '../src/features/exercises/openExercise';
import { readDefaultRest } from '../src/features/session/restDefaults';
import { RpePicker } from '../src/features/session/RpePicker';
import { BLOCKS, blockOf, type Block } from '../src/domain/blocks';
import { rpeTargetText } from '../src/features/programs/describe';
import { takePendingExercise } from '../src/features/programs/pendingExercise';
import { listExercises } from '../src/features/exercises/repository';
import { getUserProgram, saveUserProgram } from '../src/features/programs/userPrograms';
import {
  ActionButton,
  FooterAction,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  Label,
  PageHeading,
  Screen,
  SectionTitle,
  SegmentedControl,
  MenuGroup,
  Sheet,
  Stepper,
  Text,
  TextField,
  Toast,
} from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { fonts } from '../src/shared/theme/typography';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatClock, formatMinutes } from '../src/shared/utils/format';
import { TotalTargetField, totalDefaultFor } from '../src/features/programs/TotalTargetField';
import { radii } from '../src/shared/theme/tokens';

type ExerciseInfo = { name: string; metric: string };
type Draft = { name: string; sessions: UserProgramSession[] };

/** Stepper value below zero stands for "reuse last time's load". */
const LOAD_AUTO = -2.5;


export default function ProgramEditorScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [initial] = useState<Draft>(() => ({ name: '', sessions: [] }));
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState(initial.name);
  const [sessions, setSessions] = useState<UserProgramSession[]>(initial.sessions);
  const [snapshot, setSnapshot] = useState<string>(() => JSON.stringify(initial));
  const [exerciseInfo, setExerciseInfo] = useState<Map<string, ExerciseInfo>>(new Map());
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Prescription whose exercise is being replaced, with its session.
  const [replacing, setReplacing] = useState<{ sessionId: string; exerciseId: string } | null>(null);
  const [errors, setErrors] = useState<ProgramError[]>([]);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ message: string; previous: UserProgramSession[] } | null>(null);
  // Resumes a navigation held back because the edits could not be saved.
  const [leaveAction, setLeaveAction] = useState<{ resume: () => void } | null>(null);
  // Days folded to their summary; every exercise is one row, edited in a sheet.
  const [closedDays, setClosedDays] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ sessionId: string; exerciseId: string } | null>(null);
  const flip = (set: Set<string>, key: string) => { const next = new Set(set); if (!next.delete(key)) next.add(key); return next; };

  const defaultRest = readDefaultRest('working');
  // The app's default rest is always one of the presets, so it starts out selected.
  const restPresets = [...new Set([30, 60, 90, 120, 180, defaultRest])].sort((a, b) => a - b);
  const dirty = loaded && JSON.stringify({ name, sessions } satisfies Draft) !== snapshot;

  const clearError = (match: (error: ProgramError) => boolean) => setErrors((current) => current.filter((error) => !match(error)));

  const addExercise = (sessionId: string, exerciseId: string, metric: string) => {
    const prescription = newPrescription(exerciseId, metric, () => Crypto.randomUUID());
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, exercises: [...session.exercises, prescription] } : session)));
    setEditing({ sessionId, exerciseId: prescription.id });
    clearError((error) => error.sessionId === sessionId && error.code === 'sessionEmpty');
  };

  const replaceExerciseIn = (sessionId: string, prescriptionId: string, exerciseId: string, metric: string) => {
    setSessions((current) => current.map((session) => (session.id !== sessionId ? session : {
      ...session,
      exercises: session.exercises.map((item) => (item.id === prescriptionId
        ? replaceExercise(item, exerciseId, exerciseInfo.get(item.exerciseId)?.metric, metric)
        : item)),
    })));
    clearError((error) => error.exerciseId === prescriptionId);
  };

  // Exercise names are reloaded on focus so movements created from the picker show up by name.
  useFocusEffect(useCallback(() => {
    let mounted = true;
    void (async () => {
      const exercises = await listExercises();
      if (!mounted) return;
      setExerciseInfo(new Map(exercises.map((exercise) => [exercise.id, { name: exercise.name, metric: exercise.metric }])));
      if (id && !loaded) {
        const program = await getUserProgram(id);
        if (!mounted) return;
        if (program) {
          setName(program.name);
          setSessions(program.sessions);
          setSnapshot(JSON.stringify({ name: program.name, sessions: program.sessions } satisfies Draft));
        }
        setLoaded(true);
      }
      // An exercise created from this builder's picker joins the workout it was created for (after the program is loaded, which would overwrite it).
      const created = takePendingExercise();
      if (created?.replaceId) replaceExerciseIn(created.sessionId, created.replaceId, created.exerciseId, created.metric);
      else if (created) addExercise(created.sessionId, created.exerciseId, created.metric);
    })();
    return () => { mounted = false; };
    // Runs on focus and once the program is loaded; the helpers it calls only use state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loaded]));

  const updateSession = (sessionId: string, patch: Partial<UserProgramSession>) => {
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, ...patch } : session)));
  };
  const updateExercise = (sessionId: string, exerciseId: string, patch: Partial<UserProgramExercise>) => {
    setSessions((current) => current.map((session) => (session.id !== sessionId ? session : {
      ...session,
      exercises: session.exercises.map((exercise) => (exercise.id === exerciseId ? { ...exercise, ...patch } : exercise)),
    })));
    clearError((error) => error.exerciseId === exerciseId);
  };

  const removeWithUndo = (message: string, next: UserProgramSession[]) => {
    setUndo({ message, previous: sessions });
    setSessions(next);
  };


  /** Validates and stores the program; false (with the errors shown) when it cannot be saved yet. */
  const persist = async (): Promise<boolean> => {
    const found = validateUserProgram({ name, sessions });
    setErrors(found);
    if (found.length > 0) {
      // Opens the first exercise whose values are wrong.
      const bad = found.find((error) => error.exerciseId && error.sessionId);
      if (bad) setEditing({ sessionId: bad.sessionId!, exerciseId: bad.exerciseId! });
      return false;
    }
    const saved = await saveUserProgram({ id, name, sessions });
    setSnapshot(JSON.stringify({ name: saved.name, sessions: saved.sessions } satisfies Draft));
    savedId.current = saved.id;
    return true;
  };
  const savedId = useRef<string | undefined>(undefined);

  // Leaving saves valid edits on its own; edits that cannot be saved yet ask before being dropped.
  const { allowLeave } = useSaveOnLeave({
    dirty,
    save: persist,
    onInvalid: (resume) => setLeaveAction({ resume }),
  });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!(await persist())) return;
      allowLeave();
      router.replace({ pathname: '/program/user/[id]', params: { id: savedId.current! } });
    } catch {
      setErrors([{ code: 'invalidValue' }]);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;

  const metricById = new Map([...exerciseInfo].map(([exerciseId, info]) => [exerciseId, info.metric]));
  const nameError = errors.some((error) => error.code === 'nameMissing') ? t('userProgram.errors.nameMissing') : null;
  const pickerSession = sessions.find((session) => session.id === pickerFor);
  const replacingPrescription = replacing ? sessions.find((session) => session.id === replacing.sessionId)?.exercises.find((item) => item.id === replacing.exerciseId) : undefined;
  const replacingName = replacingPrescription ? exerciseInfo.get(replacingPrescription.exerciseId)?.name : undefined;
  const editSession = editing ? sessions.find((session) => session.id === editing.sessionId) : undefined;
  const editIndex = editSession && editing ? editSession.exercises.findIndex((item) => item.id === editing.exerciseId) : -1;
  const editPrescription = editSession && editIndex >= 0 ? editSession.exercises[editIndex] : undefined;
  const editInfo = editPrescription ? exerciseInfo.get(editPrescription.exerciseId) : undefined;
  const editMetric = editInfo?.metric ?? 'reps';
  const editName = editInfo?.name ?? t('userProgram.exerciseMissing');

  return (
    <Screen
      overlay={<Toast message={undo?.message ?? null} actionLabel={t('userProgram.undo')} onAction={() => { if (undo) setSessions(undo.previous); }} onHide={() => setUndo(null)} />}
      footer={<FooterAction icon="checkmark" label={saving ? t('programBuilder.saving') : t('programBuilder.save')} disabled={saving} onPress={() => void save()} />}
    >
      <PageHeading title={id ? name || t('programBuilder.editTitle') : t('userProgram.newTitle')} subtitle={t('programBuilder.subtitle')} />
      <TextField
        label={t('programBuilder.name')}
        value={name}
        onChangeText={(value) => { setName(value); clearError((error) => error.code === 'nameMissing'); }}
        placeholder={t('programBuilder.namePlaceholder')}
        maxLength={60}
        error={nameError}
      />

      <SectionTitle title={t('userProgram.daysTitle')} />
      {sessions.length === 0 ? <EmptyState icon="calendar-outline" title={t('userProgram.noWorkoutsYet')} body={t('userProgram.noWorkoutsBody')} /> : null}
      {sessions.map((session, index) => {
        const sessionErrors = errors.filter((error) => error.sessionId === session.id && !error.exerciseId);
        const dayClosed = closedDays.has(session.id) && sessionErrors.length === 0 && !errors.some((error) => error.sessionId === session.id);
        const minutes = session.exercises.length > 0 ? formatMinutes(estimateSessionSeconds(session, metricById, readDefaultRest('working'))) : null;
        return (
          <Card key={session.id} style={styles.dayCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(dayClosed ? 'logger.expand' : 'logger.collapse', { name: session.name || t('userProgram.dayNumber', { number: index + 1 }) })}
              accessibilityState={{ expanded: !dayClosed }}
              onPress={() => setClosedDays((current) => flip(current, session.id))}
              style={styles.header}
            >
              <View style={[styles.number, { backgroundColor: palette.accentSoft }]}>
                <Text style={[styles.numberText, { color: palette.accentStrong }]}>{index + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.dayTitle} numberOfLines={1}>{session.name || t('userProgram.dayNumber', { number: index + 1 })}</Text>
                {minutes ? <Label>{t('userProgram.daySummary', { count: sessionSetCount(session), minutes })}</Label> : null}
              </View>
              <Icon name={dayClosed ? 'chevron-down' : 'chevron-up'} size={20} color={palette.textMuted} />
            </Pressable>

            {dayClosed ? null : (
              <>
            <View style={styles.dayActions}>
              <IconButton icon="arrow-up" label={t('userProgram.moveDayUp')} tone="plain" size={40} onPress={() => setSessions((current) => moveItem(current, index, -1))} />
              <IconButton icon="arrow-down" label={t('userProgram.moveDayDown')} tone="plain" size={40} onPress={() => setSessions((current) => moveItem(current, index, 1))} />
              <IconButton icon="copy-outline" label={t('userProgram.duplicateDay')} tone="plain" size={40} onPress={() => setSessions((current) => {
                const copy = duplicateSession(session, () => Crypto.randomUUID());
                return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
              })} />
              <IconButton icon="trash-outline" label={t('programBuilder.removeDay')} tone="plain" size={40} onPress={() => removeWithUndo(
                t('userProgram.dayRemoved', { name: session.name || t('userProgram.dayNumber', { number: index + 1 }) }),
                sessions.filter((item) => item.id !== session.id),
              )} />
            </View>

            <TextField
              label={t('programBuilder.sessionName')}
              value={session.name}
              onChangeText={(value) => { updateSession(session.id, { name: value }); clearError((error) => error.sessionId === session.id && error.code === 'sessionNameMissing'); }}
              placeholder={t('programBuilder.sessionDefault')}
              maxLength={40}
              error={sessionErrors.some((error) => error.code === 'sessionNameMissing') ? t('userProgram.errors.sessionNameMissing') : null}
            />
            <TextField
              label={t('workoutDetails.notes')}
              value={session.notes ?? ''}
              onChangeText={(value) => updateSession(session.id, { notes: value })}
              placeholder={t('workoutDetails.notesPlaceholder')}
              multiline
              maxLength={1000}
            />
            <ReorderableList
              items={session.exercises}
              keyOf={(item) => item.id}
              nameOf={(item) => exerciseInfo.get(item.exerciseId)?.name ?? t('userProgram.exerciseMissing')}
              gap={0}
              onMove={(from, to) => updateSession(session.id, { exercises: moveItem(session.exercises, from, to - from) })}
              renderRow={(prescription, exerciseIndex, row) => {
              const info = exerciseInfo.get(prescription.exerciseId);
              const metric = info?.metric ?? 'reps';
              const exerciseName = info?.name ?? t('userProgram.exerciseMissing');
              const invalid = errors.some((error) => error.exerciseId === prescription.id);
              const suffix = isTimedMetric(metric) ? ' s' : metric === 'distance' ? ' m' : '';
              const chips = [
                prescription.totalTarget != null
                  ? t('programBuilder.totalChip', { value: isTimedMetric(metric) ? formatClock(prescription.totalTarget) : `${prescription.totalTarget}${suffix}` })
                  : prescription.target === null ? t('userProgram.setsOnly', { count: prescription.sets }) : `${prescription.sets} × ${prescription.target}${suffix}`,
                isLoadMetric(metric) && prescription.loadKg != null ? `${prescription.loadKg} kg` : null,
                prescription.restSeconds == null ? null : t('programBuilder.restChip', { value: prescription.restSeconds }),
                rpeTargetText(prescription) ? t('logger.rpeTag', { value: rpeTargetText(prescription) }) : null,
              ].filter((chip): chip is string => chip !== null);
              return (
                <View key={prescription.id} style={[styles.exercise, { borderTopColor: palette.border }, exerciseIndex === 0 && { borderTopWidth: 0 }]}>
                  <View style={styles.exerciseRow}>
                    {row.handle}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('programBuilder.editExercise', { name: exerciseName })}
                      onPress={() => setEditing({ sessionId: session.id, exerciseId: prescription.id })}
                      onLongPress={() => openExercisePage(prescription.exerciseId)}
                      accessibilityActions={[{ name: 'longpress', label: t('logger.openExercise') }]}
                      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') openExercisePage(prescription.exerciseId); }}
                      style={styles.exerciseMain}
                    >
                      <Text style={styles.exerciseName} numberOfLines={2}>{exerciseName}</Text>
                      <View style={styles.summaryChips}>
                        {chips.map((chip) => <View key={chip} style={[styles.summaryChip, { backgroundColor: palette.surfaceMuted }]}><Text style={[styles.summaryChipText, { color: palette.textMuted }]}>{chip}</Text></View>)}
                        {prescription.note?.trim() ? <Icon name="chatbubble-ellipses-outline" size={14} color={palette.textMuted} /> : null}
                      </View>
                      {invalid ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.invalidValue')}</Text> : null}
                    </Pressable>
                    <Icon name="chevron-forward" size={18} color={palette.textMuted} />
                  </View>
                </View>
              );
              }}
            />
            {sessionErrors.some((error) => error.code === 'sessionEmpty') ? (
              <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.sessionEmpty')}</Text>
            ) : null}
            <ActionButton icon="add" label={t('programBuilder.addExercise')} secondary onPress={() => setPickerFor(session.id)} />
              </>
            )}
          </Card>
        );
      })}
      <ActionButton icon="add" label={t('programBuilder.addDay')} variant="ghost" onPress={() => {
        setSessions((current) => [...current, newSession(t('programBuilder.sessionDefault'))]);
      }} />

      {errors.length > 0 ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.fix')}</Text> : null}

      <ExercisePicker
        visible={pickerFor !== null || replacing !== null}
        title={replacing ? t('userProgram.replaceTitle') : t('programBuilder.addExercise')}
        subtitle={replacing ? replacingName : pickerSession ? pickerSession.name : undefined}
        onChoose={(choice) => {
          if (replacing) replaceExerciseIn(replacing.sessionId, replacing.exerciseId, choice.id, choice.metric);
          else if (pickerFor) addExercise(pickerFor, choice.id, choice.metric);
          setPickerFor(null);
          setReplacing(null);
        }}
        onCreate={(name) => {
          const sessionId = replacing?.sessionId ?? pickerFor;
          const replaceId = replacing?.exerciseId;
          setPickerFor(null);
          setReplacing(null);
          router.push({ pathname: '/exercise/new', params: { ...(sessionId ? { addToProgram: sessionId } : {}), ...(replaceId ? { replaceProgramExercise: replaceId } : {}), ...(name ? { name } : {}) } });
        }}
        onClose={() => { setPickerFor(null); setReplacing(null); }}
      />

      <Sheet
        visible={editPrescription !== undefined && editSession !== undefined}
        onClose={() => setEditing(null)}
        title={editName}
        body={editSession && editPrescription ? `${t(`metric.${editMetric}`)} · ${t('programBuilder.exerciseOf', { number: editIndex + 1, total: editSession.exercises.length })}` : undefined}
      >
        {editSession && editPrescription ? (
          <>
            <MenuGroup title={t('programBuilder.groupWork')}>
            <Label>{t('workout.blocks.title')}</Label>
            <SegmentedControl<Block>
              value={blockOf(editPrescription.block)}
              onChange={(block) => updateExercise(editSession.id, editPrescription.id, { block: block === 'main' ? null : block })}
              options={BLOCKS.map((block) => ({ value: block, label: t(`workout.blocks.${block}`) }))}
            />
            <View style={styles.moveRow}>
              <IconButton icon="arrow-up" label={t('programBuilder.moveExerciseUp')} tone="plain" size={44} disabled={editIndex === 0} onPress={() => updateSession(editSession.id, { exercises: moveItem(editSession.exercises, editIndex, -1) })} />
              <IconButton icon="arrow-down" label={t('programBuilder.moveExerciseDown')} tone="plain" size={44} disabled={editIndex === editSession.exercises.length - 1} onPress={() => updateSession(editSession.id, { exercises: moveItem(editSession.exercises, editIndex, 1) })} />
            </View>
            <SegmentedControl<'sets' | 'total'>
              value={editPrescription.totalTarget != null ? 'total' : 'sets'}
              onChange={(mode) => updateExercise(editSession.id, editPrescription.id, mode === 'total'
                ? { totalTarget: totalDefaultFor(editMetric, editPrescription.target, editPrescription.sets), rpePerSet: null, rpe: editPrescription.rpePerSet?.find((value) => value !== null) ?? editPrescription.rpe ?? null }
                : { totalTarget: null })}
              options={[{ value: 'sets', label: t('programBuilder.modeSets') }, { value: 'total', label: t('programBuilder.modeTotal') }]}
            />
            {editPrescription.totalTarget != null ? (
              <>
                <TotalTargetField metric={editMetric} value={editPrescription.totalTarget} onChange={(totalTarget) => updateExercise(editSession.id, editPrescription.id, { totalTarget })} />
                <View style={[styles.totalHint, { backgroundColor: palette.surfaceMuted }]}>
                  <Icon name="timer-outline" size={18} color={palette.accentStrong} />
                  <View style={styles.flex}>
                    <Text style={styles.exerciseName}>{t('programBuilder.freeRestTitle')}</Text>
                    <Label>{t('programBuilder.freeRestBody')}</Label>
                  </View>
                </View>
              </>
            ) : null}
            {editPrescription.totalTarget != null ? null : <Stepper layout="row" label={t('programBuilder.sets')} value={editPrescription.sets} step={1} min={1} max={20} editable onChange={(sets) => updateExercise(editSession.id, editPrescription.id, { sets: Math.max(1, Math.round(sets)), ...(editPrescription.rpePerSet ? { rpePerSet: fitRpePerSet(editPrescription.rpePerSet, Math.max(1, Math.round(sets))) } : {}) })} />}
            {editPrescription.totalTarget != null ? <Label>{t('programBuilder.perSetHint')}</Label> : null}
            <TargetStepper metric={editMetric} value={editPrescription.target} onChange={(target) => updateExercise(editSession.id, editPrescription.id, { target })} />
            </MenuGroup>
            <MenuGroup title={t('userProgram.rest')}>
            <DurationField
              label={t('userProgram.rest')}
              // A rest of its own, else the app's default rest, shown as the selected value.
              value={editPrescription.restSeconds ?? defaultRest}
              max={600}
              step={5}
              presets={restPresets}
              format={(seconds) => t('userProgram.secondsValue', { value: seconds })}
              onChange={(restSeconds) => updateExercise(editSession.id, editPrescription.id, { restSeconds })}
            />
            </MenuGroup>
            <MenuGroup title={t('programBuilder.rpeTarget')}>
              {editPrescription.totalTarget != null ? null : <SegmentedControl<'same' | 'perSet'>
                value={editPrescription.rpePerSet ? 'perSet' : 'same'}
                onChange={(mode) => updateExercise(editSession.id, editPrescription.id, mode === 'perSet'
                  ? { rpePerSet: fitRpePerSet([editPrescription.rpe ?? null], editPrescription.sets), rpe: null }
                  : { rpe: editPrescription.rpePerSet?.find((value) => value !== null) ?? null, rpePerSet: null })}
                options={[{ value: 'same', label: t('programBuilder.rpeSame') }, { value: 'perSet', label: t('programBuilder.rpePerSet') }]}
              />}
              {editPrescription.rpePerSet ? editPrescription.rpePerSet.map((value, index) => (
                <RpePicker
                  key={index}
                  compact
                  label={String(index + 1)}
                  sideLabel={t('programBuilder.rpeSet', { number: index + 1 })}
                  value={value}
                  onChange={(next) => updateExercise(editSession.id, editPrescription.id, { rpePerSet: editPrescription.rpePerSet!.map((item, position) => (position === index ? next : item)) })}
                />
              )) : (
                <RpePicker compact grid value={editPrescription.rpe ?? null} onChange={(rpe) => updateExercise(editSession.id, editPrescription.id, { rpe })} />
              )}
              {!rpeTargetText(editPrescription) ? <Label>{t('programBuilder.rpeNone')}</Label> : null}
            </MenuGroup>
            {isLoadMetric(editMetric) ? (
              <MenuGroup title={t('userProgram.load')}>
              <Stepper
                layout="column"
                label={t('userProgram.load')}
                value={editPrescription.loadKg ?? LOAD_AUTO}
                display={editPrescription.loadKg === null || editPrescription.loadKg === undefined ? t('userProgram.loadAuto') : t('userProgram.kgValue', { value: editPrescription.loadKg })}
                step={2.5}
                min={LOAD_AUTO}
                max={300}
                editable
                onChange={(value) => updateExercise(editSession.id, editPrescription.id, { loadKg: value < 0 ? null : value })}
              />
              </MenuGroup>
            ) : null}
            <MenuGroup title={t('userProgram.noteLabel')}>
            <TextField
              label={t('userProgram.noteLabel')}
              value={editPrescription.note ?? ''}
              onChangeText={(note) => updateExercise(editSession.id, editPrescription.id, { note })}
              placeholder={t('userProgram.notePlaceholder')}
              multiline
              maxLength={NOTE_MAX}
            />
            </MenuGroup>
            <View style={styles.sheetButtons}>
              <ActionButton icon="swap-horizontal" label={t('userProgram.replaceExercise', { name: editName })} secondary onPress={() => { setReplacing({ sessionId: editSession.id, exerciseId: editPrescription.id }); setEditing(null); }} />
              <ActionButton icon="trash-outline" label={t('userProgram.removeExercise', { name: editName })} variant="danger" onPress={() => {
                const target = editPrescription;
                setEditing(null);
                removeWithUndo(
                  t('userProgram.exerciseRemoved', { name: editName }),
                  sessions.map((item) => (item.id === editSession.id ? { ...item, exercises: item.exercises.filter((exercise) => exercise.id !== target.id) } : item)),
                );
              }} />
            </View>
            <ActionButton label={t('programBuilder.exerciseDone')} onPress={() => setEditing(null)} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={leaveAction !== null} onClose={() => setLeaveAction(null)} title={t('userProgram.unsavedTitle')} body={t('userProgram.unsavedInvalidBody')}>
        <ActionButton icon="trash-outline" label={t('userProgram.discard')} variant="danger" onPress={() => {
          const action = leaveAction;
          setLeaveAction(null);
          action?.resume();
        }} />
        <ActionButton label={t('userProgram.fixFields')} secondary onPress={() => setLeaveAction(null)} />
      </Sheet>
    </Screen>
  );
}

/** The reps (or hold, or distance) of an exercise; optional, so a workout can be drafted without them. */
function TargetStepper({ metric, value, onChange }: { metric: string; value: number | null; onChange: (value: number | null) => void }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const label = isTimedMetric(metric) ? t('programBuilder.seconds') : metric === 'distance' ? t('programBuilder.meters') : t('programBuilder.reps');
  if (value === null) {
    return (
      <View style={targetStyles.open}>
        <Text style={[targetStyles.label, { color: palette.text }]}>{label}</Text>
        <Text style={[targetStyles.hint, { color: palette.textMuted }]}>{t('userProgram.targetOpen')}</Text>
        <Chip label={t('userProgram.targetSet')} icon="add" onPress={() => onChange(DEFAULT_TARGET_FOR(metric))} />
      </View>
    );
  }
  const control = isTimedMetric(metric)
    ? <HoldDurationField label={t('logger.holdCol')} value={value} min={1} max={600} onChange={onChange} />
    : metric === 'distance'
      ? <Stepper layout="row" label={label} value={value} display={t('userProgram.metersValue', { value })} step={10} min={10} max={5000} editable onChange={onChange} />
      : <Stepper layout="row" label={label} value={value} step={1} min={1} max={100} editable onChange={onChange} />;
  return (
    <View>
      {control}
      <View style={targetStyles.clear}><Chip label={t('userProgram.targetClear')} icon="close" onPress={() => onChange(null)} /></View>
    </View>
  );
}

const targetStyles = StyleSheet.create({
  open: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, minHeight: 48 },
  label: { fontFamily: fonts.medium, fontSize: 15 },
  hint: { flex: 1, fontFamily: fonts.body, fontSize: 14 },
  clear: { flexDirection: 'row', paddingTop: 4 },
});

function newSession(name: string): UserProgramSession {
  return { id: Crypto.randomUUID(), name, exercises: [] };
}

const baseStyles = StyleSheet.create({
  rpeBlock: { gap: 8 },
  totalHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: radii.control, padding: 14 },
  moveRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  sheetButtons: { gap: 8 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
  exerciseMain: { flex: 1, gap: 6, minHeight: 48, justifyContent: 'center' },
  summaryChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  summaryChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.control },
  summaryChipText: { fontFamily: fonts.body, fontSize: 13 },
  flex: { flex: 1, gap: 4 },
  dayCard: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  number: { width: 28, height: 28, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  numberText: { fontFamily: fonts.display, fontSize: 16 },
  dayTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  field: { gap: 8 },
  dayActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: -6 },
  exerciseActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  exercise: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  exerciseName: { fontFamily: fonts.semibold, fontSize: 16 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
