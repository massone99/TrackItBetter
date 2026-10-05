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
  Sheet,
  Stepper,
  Text,
  TextField,
  Toast,
} from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { fonts } from '../src/shared/theme/typography';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatMinutes } from '../src/shared/utils/format';

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
  // Days folded to their summary, and exercises opened for editing; the rest show one line.
  const [closedDays, setClosedDays] = useState<Set<string>>(new Set());
  const [openExercises, setOpenExercises] = useState<Set<string>>(new Set());
  const flip = (set: Set<string>, key: string) => { const next = new Set(set); if (!next.delete(key)) next.add(key); return next; };

  const defaultRest = readDefaultRest('working');
  // The app's default rest is always one of the presets, so it starts out selected.
  const restPresets = [...new Set([30, 60, 90, 120, 180, defaultRest])].sort((a, b) => a - b);
  const dirty = loaded && JSON.stringify({ name, sessions } satisfies Draft) !== snapshot;

  const clearError = (match: (error: ProgramError) => boolean) => setErrors((current) => current.filter((error) => !match(error)));

  const addExercise = (sessionId: string, exerciseId: string, metric: string) => {
    const prescription = newPrescription(exerciseId, metric, () => Crypto.randomUUID());
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, exercises: [...session.exercises, prescription] } : session)));
    setOpenExercises((current) => new Set(current).add(prescription.id));
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
    if (found.length > 0) return false;
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
              const isOpen = openExercises.has(prescription.id) || invalid;
              const suffix = isTimedMetric(metric) ? 's' : metric === 'distance' ? ' m' : '';
              const summary = [
                prescription.target === null ? t('userProgram.setsOnly', { count: prescription.sets }) : `${prescription.sets} × ${prescription.target}${suffix}`,
                isLoadMetric(metric) ? (prescription.loadKg == null ? null : `${prescription.loadKg} kg`) : null,
                prescription.restSeconds == null ? null : `${prescription.restSeconds}s`,
              ].filter(Boolean).join(' · ') + (rpeTargetText(prescription) ? ` @ ${t('logger.rpeTag', { value: rpeTargetText(prescription) })}` : '');
              return (
                <View key={prescription.id} style={[styles.exercise, { borderTopColor: palette.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(isOpen ? 'logger.collapse' : 'logger.expand', { name: exerciseName })}
                    accessibilityState={{ expanded: isOpen }}
                    onPress={() => setOpenExercises((current) => flip(current, prescription.id))}
                    onLongPress={() => openExercisePage(prescription.exerciseId)}
                    accessibilityActions={[{ name: 'longpress', label: t('logger.openExercise') }]}
                    onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') openExercisePage(prescription.exerciseId); }}
                    style={styles.header}
                  >
                    {row.handle}
                    <View style={styles.flex}>
                      <Text style={styles.exerciseName} numberOfLines={2}>{exerciseName}</Text>
                      <Label>{t(`metric.${metric}`)}</Label>
                      <Label>{summary}</Label>
                      {prescription.note?.trim() ? <Label numberOfLines={1}>{prescription.note.trim()}</Label> : null}
                    </View>
                    <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
                  </Pressable>
                  {isOpen ? (
                    <>
                  <Stepper layout="row" label={t('programBuilder.sets')} value={prescription.sets} step={1} min={1} max={20} editable onChange={(sets) => updateExercise(session.id, prescription.id, { sets: Math.max(1, Math.round(sets)), ...(prescription.rpePerSet ? { rpePerSet: fitRpePerSet(prescription.rpePerSet, Math.max(1, Math.round(sets))) } : {}) })} />
                  <TargetStepper metric={metric} value={prescription.target} onChange={(target) => updateExercise(session.id, prescription.id, { target })} />
                  <TextField
                    label={t('userProgram.noteLabel')}
                    value={prescription.note ?? ''}
                    onChangeText={(note) => updateExercise(session.id, prescription.id, { note })}
                    placeholder={t('userProgram.notePlaceholder')}
                    multiline
                    maxLength={NOTE_MAX}
                  />
                  <DurationField
                    label={t('userProgram.rest')}
                    // A rest of its own, else the app's default rest, shown as the selected value.
                    value={prescription.restSeconds ?? defaultRest}
                    max={600}
                    step={5}
                    presets={restPresets}
                    format={(seconds) => t('userProgram.secondsValue', { value: seconds })}
                    onChange={(restSeconds) => updateExercise(session.id, prescription.id, { restSeconds })}
                  />
                  <View style={styles.rpeBlock}>
                    <Label>{t('programBuilder.rpeTarget')}</Label>
                    <SegmentedControl<'same' | 'perSet'>
                      value={prescription.rpePerSet ? 'perSet' : 'same'}
                      onChange={(mode) => updateExercise(session.id, prescription.id, mode === 'perSet'
                        ? { rpePerSet: fitRpePerSet([prescription.rpe ?? null], prescription.sets), rpe: null }
                        : { rpe: prescription.rpePerSet?.find((value) => value !== null) ?? null, rpePerSet: null })}
                      options={[{ value: 'same', label: t('programBuilder.rpeSame') }, { value: 'perSet', label: t('programBuilder.rpePerSet') }]}
                    />
                    {prescription.rpePerSet ? prescription.rpePerSet.map((value, index) => (
                      <RpePicker
                        key={index}
                        compact
                        label={String(index + 1)}
                        sideLabel={t('programBuilder.rpeSet', { number: index + 1 })}
                        value={value}
                        onChange={(next) => updateExercise(session.id, prescription.id, { rpePerSet: prescription.rpePerSet!.map((item, position) => (position === index ? next : item)) })}
                      />
                    )) : (
                      <RpePicker compact value={prescription.rpe ?? null} onChange={(rpe) => updateExercise(session.id, prescription.id, { rpe })} />
                    )}
                    {!rpeTargetText(prescription) ? <Label>{t('programBuilder.rpeNone')}</Label> : null}
                  </View>
                  {isLoadMetric(metric) ? (
                    <Stepper
                      layout="row"
                      label={t('userProgram.load')}
                      value={prescription.loadKg ?? LOAD_AUTO}
                      display={prescription.loadKg === null || prescription.loadKg === undefined ? t('userProgram.loadAuto') : t('userProgram.kgValue', { value: prescription.loadKg })}
                      step={2.5}
                      min={LOAD_AUTO}
                      max={300}
                      editable
                      onChange={(value) => updateExercise(session.id, prescription.id, { loadKg: value < 0 ? null : value })}
                    />
                  ) : null}
                  <View style={styles.exerciseActions}>
                    <IconButton icon="swap-horizontal" label={t('userProgram.replaceExercise', { name: exerciseName })} tone="plain" size={40} onPress={() => setReplacing({ sessionId: session.id, exerciseId: prescription.id })} />
                    <IconButton icon="trash-outline" label={t('userProgram.removeExercise', { name: exerciseName })} tone="plain" size={40} onPress={() => removeWithUndo(
                      t('userProgram.exerciseRemoved', { name: exerciseName }),
                      sessions.map((item) => (item.id === session.id ? { ...item, exercises: item.exercises.filter((exercise) => exercise.id !== prescription.id) } : item)),
                    )} />
                  </View>
                    </>
                  ) : null}
                  {invalid ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.invalidValue')}</Text> : null}
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
  flex: { flex: 1, gap: 2 },
  dayCard: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  number: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  numberText: { fontFamily: fonts.display, fontSize: 16 },
  dayTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  field: { gap: 8 },
  dayActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: -6 },
  exerciseActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  exercise: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 8 },
  exerciseName: { fontFamily: fonts.semibold, fontSize: 16 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
