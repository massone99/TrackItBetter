import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  duplicateSession,
  estimateSessionSeconds,
  isLoadMetric,
  isTimedMetric,
  moveItem,
  sessionSetCount,
  validateUserProgram,
  type ProgramError,
  type UserProgramExercise,
  type UserProgramSession,
} from '../src/domain/userProgram';
import { ExercisePicker } from '../src/features/exercises/ExercisePicker';
import { listExercises } from '../src/features/exercises/repository';
import { getUserProgram, saveUserProgram } from '../src/features/programs/userPrograms';
import {
  ActionButton,
  Card,
  EmptyState,
  IconButton,
  Label,
  PageHeading,
  Screen,
  SectionTitle,
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
  const navigation = useNavigation();
  const [initial] = useState<Draft>(() => ({ name: '', sessions: id ? [] : [newSession(t('programBuilder.sessionDefault'))] }));
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState(initial.name);
  const [sessions, setSessions] = useState<UserProgramSession[]>(initial.sessions);
  const [snapshot, setSnapshot] = useState<string>(() => JSON.stringify(initial));
  const [exerciseInfo, setExerciseInfo] = useState<Map<string, ExerciseInfo>>(new Map());
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<ProgramError[]>([]);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ message: string; previous: UserProgramSession[] } | null>(null);
  const [leaveAction, setLeaveAction] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const allowLeave = useRef(false);

  const dirty = loaded && JSON.stringify({ name, sessions } satisfies Draft) !== snapshot;

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
    })();
    return () => { mounted = false; };
  }, [id, loaded]));

  // Leaving with unsaved edits asks first instead of silently dropping them.
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (!dirty || allowLeave.current) return;
    event.preventDefault();
    setLeaveAction(event.data.action);
  }), [navigation, dirty]);

  const clearError = (match: (error: ProgramError) => boolean) => setErrors((current) => current.filter((error) => !match(error)));

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

  const addExercise = (sessionId: string, exerciseId: string, metric: string) => {
    const target = isTimedMetric(metric) ? 30 : metric === 'distance' ? 100 : 8;
    const prescription: UserProgramExercise = { id: Crypto.randomUUID(), exerciseId, sets: 3, target, restSeconds: 90, loadKg: null };
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, exercises: [...session.exercises, prescription] } : session)));
    clearError((error) => error.sessionId === sessionId && error.code === 'sessionEmpty');
  };

  const save = async () => {
    if (saving) return;
    const found = validateUserProgram({ name, sessions });
    setErrors(found);
    if (found.length > 0) return;
    setSaving(true);
    try {
      const saved = await saveUserProgram({ id, name, sessions });
      allowLeave.current = true;
      router.replace({ pathname: '/program/user/[id]', params: { id: saved.id } });
    } catch {
      setErrors([{ code: 'noSessions' }]);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;

  const metricById = new Map([...exerciseInfo].map(([exerciseId, info]) => [exerciseId, info.metric]));
  const nameError = errors.some((error) => error.code === 'nameMissing') ? t('userProgram.errors.nameMissing') : null;
  const pickerSession = sessions.find((session) => session.id === pickerFor);

  return (
    <Screen overlay={<Toast message={undo?.message ?? null} actionLabel={t('userProgram.undo')} onAction={() => { if (undo) setSessions(undo.previous); }} onHide={() => setUndo(null)} />}>
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
      {sessions.length === 0 ? <EmptyState icon="calendar-outline" title={t('programBuilder.addDay')} body={t('userProgram.errors.noSessions')} /> : null}
      {sessions.map((session, index) => {
        const sessionErrors = errors.filter((error) => error.sessionId === session.id && !error.exerciseId);
        const minutes = session.exercises.length > 0 ? formatMinutes(estimateSessionSeconds(session, metricById)) : null;
        return (
          <Card key={session.id} style={styles.dayCard}>
            <View style={styles.header}>
              <View style={[styles.number, { backgroundColor: palette.accentSoft }]}>
                <Text style={[styles.numberText, { color: palette.accentStrong }]}>{index + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.dayTitle} numberOfLines={1}>{session.name || t('userProgram.dayNumber', { number: index + 1 })}</Text>
                {minutes ? <Label>{t('userProgram.daySummary', { count: sessionSetCount(session), minutes })}</Label> : null}
              </View>
              <IconButton icon="chevron-up" label={t('userProgram.moveDayUp')} tone="plain" size={34} onPress={() => setSessions((current) => moveItem(current, index, -1))} />
              <IconButton icon="chevron-down" label={t('userProgram.moveDayDown')} tone="plain" size={34} onPress={() => setSessions((current) => moveItem(current, index, 1))} />
              <IconButton icon="copy-outline" label={t('userProgram.duplicateDay')} tone="plain" size={34} onPress={() => setSessions((current) => {
                const copy = duplicateSession(session, () => Crypto.randomUUID());
                return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
              })} />
              <IconButton icon="trash-outline" label={t('programBuilder.removeDay')} tone="plain" size={34} onPress={() => removeWithUndo(
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
            {session.exercises.map((prescription, exerciseIndex) => {
              const info = exerciseInfo.get(prescription.exerciseId);
              const metric = info?.metric ?? 'reps';
              const exerciseName = info?.name ?? t('userProgram.exerciseMissing');
              const invalid = errors.some((error) => error.exerciseId === prescription.id);
              return (
                <View key={prescription.id} style={[styles.exercise, { borderTopColor: palette.border }]}>
                  <View style={styles.header}>
                    <View style={styles.flex}>
                      <Text style={styles.exerciseName} numberOfLines={2}>{exerciseName}</Text>
                      <Label>{t(`metric.${metric}`)}</Label>
                    </View>
                    <IconButton icon="chevron-up" label={t('userProgram.moveExerciseUp', { name: exerciseName })} tone="plain" size={32} onPress={() => updateSession(session.id, { exercises: moveItem(session.exercises, exerciseIndex, -1) })} />
                    <IconButton icon="chevron-down" label={t('userProgram.moveExerciseDown', { name: exerciseName })} tone="plain" size={32} onPress={() => updateSession(session.id, { exercises: moveItem(session.exercises, exerciseIndex, 1) })} />
                    <IconButton icon="close" label={t('userProgram.removeExercise', { name: exerciseName })} tone="plain" size={32} onPress={() => removeWithUndo(
                      t('userProgram.exerciseRemoved', { name: exerciseName }),
                      sessions.map((item) => (item.id === session.id ? { ...item, exercises: item.exercises.filter((exercise) => exercise.id !== prescription.id) } : item)),
                    )} />
                  </View>
                  <Stepper layout="row" label={t('programBuilder.sets')} value={prescription.sets} step={1} min={1} max={10} onChange={(sets) => updateExercise(session.id, prescription.id, { sets })} />
                  <TargetStepper metric={metric} value={prescription.target} onChange={(target) => updateExercise(session.id, prescription.id, { target })} />
                  <Stepper
                    layout="row"
                    label={t('userProgram.rest')}
                    value={prescription.restSeconds}
                    display={t('userProgram.secondsValue', { value: prescription.restSeconds })}
                    step={15}
                    min={0}
                    max={600}
                    onChange={(restSeconds) => updateExercise(session.id, prescription.id, { restSeconds })}
                  />
                  {isLoadMetric(metric) ? (
                    <Stepper
                      layout="row"
                      label={t('userProgram.load')}
                      value={prescription.loadKg ?? LOAD_AUTO}
                      display={prescription.loadKg === null || prescription.loadKg === undefined ? t('userProgram.loadAuto') : t('userProgram.kgValue', { value: prescription.loadKg })}
                      step={2.5}
                      min={LOAD_AUTO}
                      max={300}
                      onChange={(value) => updateExercise(session.id, prescription.id, { loadKg: value < 0 ? null : value })}
                    />
                  ) : null}
                  {invalid ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.invalidValue')}</Text> : null}
                </View>
              );
            })}
            {sessionErrors.some((error) => error.code === 'sessionEmpty') ? (
              <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.sessionEmpty')}</Text>
            ) : null}
            <ActionButton icon="add" label={t('programBuilder.addExercise')} secondary onPress={() => setPickerFor(session.id)} />
          </Card>
        );
      })}
      <ActionButton icon="add" label={t('programBuilder.addDay')} variant="ghost" onPress={() => {
        setSessions((current) => [...current, newSession(t('programBuilder.sessionDefault'))]);
        clearError((error) => error.code === 'noSessions');
      }} />

      {errors.length > 0 ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.fix')}</Text> : null}
      <ActionButton icon="checkmark" label={saving ? t('programBuilder.saving') : t('programBuilder.save')} disabled={saving} onPress={() => void save()} />

      <ExercisePicker
        visible={pickerFor !== null}
        title={t('programBuilder.addExercise')}
        subtitle={pickerSession ? pickerSession.name : undefined}
        onChoose={(choice) => {
          if (pickerFor) addExercise(pickerFor, choice.id, choice.metric);
          setPickerFor(null);
        }}
        onCreate={() => { setPickerFor(null); router.push('/exercise/new'); }}
        onClose={() => setPickerFor(null)}
      />

      <Sheet visible={leaveAction !== null} onClose={() => setLeaveAction(null)} title={t('userProgram.unsavedTitle')} body={t('userProgram.unsavedBody')}>
        <ActionButton icon="trash-outline" label={t('userProgram.discard')} variant="danger" onPress={() => {
          const action = leaveAction;
          setLeaveAction(null);
          allowLeave.current = true;
          if (action) navigation.dispatch(action);
        }} />
        <ActionButton label={t('userProgram.keepEditing')} secondary onPress={() => setLeaveAction(null)} />
      </Sheet>
    </Screen>
  );
}

function TargetStepper({ metric, value, onChange }: { metric: string; value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  if (isTimedMetric(metric)) {
    return <Stepper layout="row" label={t('programBuilder.seconds')} value={value} display={t('userProgram.secondsValue', { value })} step={5} min={5} max={600} onChange={onChange} />;
  }
  if (metric === 'distance') {
    return <Stepper layout="row" label={t('programBuilder.meters')} value={value} display={t('userProgram.metersValue', { value })} step={10} min={10} max={5000} onChange={onChange} />;
  }
  return <Stepper layout="row" label={t('programBuilder.reps')} value={value} step={1} min={1} max={100} onChange={onChange} />;
}

function newSession(name: string): UserProgramSession {
  return { id: Crypto.randomUUID(), name, exercises: [] };
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  dayCard: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  number: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  numberText: { fontFamily: fonts.display, fontSize: 16 },
  dayTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 24 },
  field: { gap: 8 },
  exercise: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 2 },
  exerciseName: { fontFamily: fonts.semibold, fontSize: 16 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
