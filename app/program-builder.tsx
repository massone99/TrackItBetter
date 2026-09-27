import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { useTranslation } from 'react-i18next';
import { addExerciseToWorkout, addSet, startWorkout, updateSet } from '../src/features/session/repository';
import { listExercises } from '../src/features/exercises/repository';
import type { Exercise } from '../src/db/schema';
import { deleteUserProgram, listUserPrograms, saveUserProgram, type UserProgram, type UserProgramExercise, type UserProgramSession, type Weekday } from '../src/features/programs/userPrograms';
import { ActionButton, Body, Card, Label, PageHeading, Screen, SectionTitle } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

const weekdays: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export default function ProgramBuilderScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [programs, setPrograms] = useState<UserProgram[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [name, setName] = useState('');
  const [sessions, setSessions] = useState<UserProgramSession[]>([]);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [pickerSession, setPickerSession] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = async () => {
    const [saved, catalog] = await Promise.all([listUserPrograms(), listExercises()]);
    setPrograms(saved);
    setExercises(catalog);
    setLoading(false);
  };
  useEffect(() => {
    let current = true;
    void Promise.all([listUserPrograms(), listExercises()]).then(([saved, catalog]) => {
      if (current) {
        setPrograms(saved);
        setExercises(catalog);
        setLoading(false);
      }
    });
    return () => { current = false; };
  }, []);

  const filteredExercises = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return exercises.filter((exercise) => !query || exercise.name.toLocaleLowerCase().includes(query)).slice(0, 8);
  }, [exercises, search]);

  const newProgram = () => {
    setEditingId(undefined);
    setName('');
    setSessions([{ id: Crypto.randomUUID(), weekday: 1, name: t('programBuilder.sessionDefault'), exercises: [] }]);
    setError('');
  };

  const editProgram = (program: UserProgram) => {
    setEditingId(program.id);
    setName(program.name);
    setSessions(program.sessions.map((session) => ({ ...session, exercises: session.exercises.map((exercise) => ({ ...exercise })) })));
    setError('');
  };

  const updateSession = (sessionId: string, update: Partial<UserProgramSession>) => {
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, ...update } : session));
  };
  const updatePrescription = (sessionId: string, exerciseId: string, update: Partial<UserProgramExercise>) => {
    setSessions((current) => current.map((session) => session.id !== sessionId ? session : {
      ...session,
      exercises: session.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...update } : exercise),
    }));
  };

  const addSession = () => {
    setSessions((current) => [...current, {
      id: Crypto.randomUUID(), weekday: 1, name: t('programBuilder.sessionDefault'), exercises: [],
    }]);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const saved = await saveUserProgram({ id: editingId, name, sessions });
      setPrograms((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setEditingId(saved.id);
    } catch {
      setError(t('programBuilder.validation'));
    } finally {
      setSaving(false);
    }
  };

  const removeProgram = (program: UserProgram) => Alert.alert(
    t('programBuilder.deleteTitle'),
    t('programBuilder.deleteBody', { name: program.name }),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('programBuilder.delete'), style: 'destructive', onPress: () => void deleteUserProgram(program.id).then(refresh) },
    ],
  );

  const startSession = async (program: UserProgram, session: UserProgramSession) => {
    if (starting) return;
    setStarting(session.id);
    try {
      const workoutId = await startWorkout(`${program.name} · ${session.name}`);
      for (const prescription of session.exercises) {
        const entryId = await addExerciseToWorkout(workoutId, prescription.exerciseId);
        const catalogEntry = exercises.find((exercise) => exercise.id === prescription.exerciseId);
        const timed = catalogEntry?.metric === 'time' || catalogEntry?.metric === 'time_load';
        const distance = catalogEntry?.metric === 'distance';
        const setIds = [await addSet(entryId)];
        while (setIds.length < prescription.sets) setIds.push(await addSet(entryId));
        for (const setId of setIds) {
          await updateSet(setId, 'restSec', prescription.restSeconds);
          if (timed) await updateSet(setId, 'durationSec', prescription.target);
          else if (distance) await updateSet(setId, 'distanceM', prescription.target);
          else await updateSet(setId, 'reps', prescription.target);
        }
      }
      router.replace({ pathname: '/workout/[id]', params: { id: workoutId } });
    } catch (startError) {
      Alert.alert(t('programBuilder.startError'), startError instanceof Error ? startError.message : t('startup.errorBody'));
    } finally {
      setStarting(null);
    }
  };

  return (
    <Screen>
      <PageHeading title={t('programBuilder.title')} subtitle={t('programBuilder.subtitle')} />
      {loading ? <Body>{t('startup.loadingBody')}</Body> : null}
      {programs.map((program) => (
        <Card key={program.id} style={styles.savedCard}>
          <View style={styles.savedHeader}>
            <View style={styles.flex}><Text style={[styles.programName, { color: palette.text }]}>{program.name}</Text><Body>{t('programBuilder.dayCount', { count: program.sessions.length })}</Body></View>
            <Pressable onPress={() => removeProgram(program)} accessibilityRole="button" accessibilityLabel={t('programBuilder.delete')}><Text style={[styles.deleteText, { color: palette.warning }]}>{t('programBuilder.delete')}</Text></Pressable>
          </View>
          {program.sessions.slice().sort((a, b) => weekdays.indexOf(a.weekday) - weekdays.indexOf(b.weekday)).map((session) => (
            <View key={session.id} style={[styles.savedSession, { borderColor: palette.border }]}>
              <View style={styles.flex}><Label>{t(`reminders.weekdays.${weekdayKey(session.weekday)}`)}</Label><Text style={[styles.sessionName, { color: palette.text }]}>{session.name}</Text><Body>{t('programBuilder.exerciseCount', { count: session.exercises.length })}</Body></View>
              <Pressable disabled={starting !== null} onPress={() => void startSession(program, session)} style={[styles.startButton, { backgroundColor: palette.accent }]}><Text style={{ color: palette.accentText, fontWeight: '800' }}>{starting === session.id ? t('programBuilder.starting') : t('programBuilder.startDay')}</Text></Pressable>
            </View>
          ))}
          <Pressable onPress={() => editProgram(program)} accessibilityRole="button"><Text style={[styles.editLink, { color: palette.accentStrong }]}>{t('programBuilder.edit')}</Text></Pressable>
        </Card>
      ))}

      {sessions.length === 0 ? <ActionButton label={t('programBuilder.create')} onPress={newProgram} /> : null}
      {sessions.length > 0 ? <>
        <SectionTitle title={editingId ? t('programBuilder.editTitle') : t('programBuilder.createTitle')} />
        <Card style={styles.editor}>
          <View style={styles.field}>
            <Label>{t('programBuilder.name')}</Label>
            <TextInput accessibilityLabel={t('programBuilder.name')} value={name} onChangeText={setName} placeholder={t('programBuilder.namePlaceholder')} placeholderTextColor={palette.textMuted} style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]} />
          </View>
          {sessions.map((session) => <Card key={session.id} style={[styles.dayCard, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
            <View style={styles.field}>
              <View style={styles.rowBetween}><Label>{t('programBuilder.trainingDay')}</Label><Pressable onPress={() => setSessions((all) => all.filter((item) => item.id !== session.id))}><Text style={{ color: palette.warning, fontWeight: '700' }}>{t('programBuilder.removeDay')}</Text></Pressable></View>
              <TextInput accessibilityLabel={t('programBuilder.sessionName')} value={session.name} onChangeText={(value) => updateSession(session.id, { name: value })} placeholder={t('programBuilder.sessionDefault')} placeholderTextColor={palette.textMuted} style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]} />
              <View style={styles.choices}>{weekdays.map((day) => <Choice key={day} label={t(`reminders.weekdaysShort.${weekdayKey(day)}`)} selected={session.weekday === day} onPress={() => updateSession(session.id, { weekday: day })} />)}</View>
            </View>
            {session.exercises.map((prescription) => {
              const exercise = exercises.find((item) => item.id === prescription.exerciseId);
              const metric = exercise?.metric ?? 'reps';
              return <View key={prescription.id} style={[styles.prescription, { borderColor: palette.border }]}>
                <View style={styles.rowBetween}><Text style={[styles.exerciseName, { color: palette.text }]}>{exercise?.name ?? prescription.exerciseId}</Text><Pressable onPress={() => updateSession(session.id, { exercises: session.exercises.filter((item) => item.id !== prescription.id) })}><Text style={{ color: palette.warning }}>{t('programBuilder.removeExercise')}</Text></Pressable></View>
                <View style={styles.values}>
                  <NumberField label={t('programBuilder.sets')} value={prescription.sets} onChange={(value) => updatePrescription(session.id, prescription.id, { sets: value })} />
                  <NumberField label={targetLabel(metric, t)} value={prescription.target} onChange={(value) => updatePrescription(session.id, prescription.id, { target: value })} />
                  <NumberField label={t('programBuilder.rest')} value={prescription.restSeconds} onChange={(value) => updatePrescription(session.id, prescription.id, { restSeconds: value })} allowZero />
                </View>
              </View>;
            })}
            <ActionButton label={t('programBuilder.addExercise')} onPress={() => { setPickerSession(pickerSession === session.id ? null : session.id); setSearch(''); }} />
            {pickerSession === session.id ? <View style={styles.picker}>
              <TextInput accessibilityLabel={t('programBuilder.search')} value={search} onChangeText={setSearch} placeholder={t('programBuilder.search')} placeholderTextColor={palette.textMuted} style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]} />
              {filteredExercises.map((exercise) => <Pressable key={exercise.id} onPress={() => {
                const metric = exercise.metric;
                const target = metric === 'time' || metric === 'time_load' ? 20 : metric === 'distance' ? 100 : 8;
                updateSession(session.id, { exercises: [...session.exercises, { id: Crypto.randomUUID(), exerciseId: exercise.id, sets: 3, target, restSeconds: 90 }] });
                setPickerSession(null);
              }} style={[styles.exerciseOption, { borderColor: palette.border }]}><Text style={{ color: palette.text }}>{exercise.name}</Text><Text style={{ color: palette.textMuted }}>{t(`customExercise.metrics.${exercise.metric}`)}</Text></Pressable>)}
              {filteredExercises.length === 0 ? <Body>{t('programBuilder.noExercises')}</Body> : null}
            </View> : null}
          </Card>)}
          <ActionButton label={t('programBuilder.addDay')} onPress={addSession} />
          {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
          <ActionButton label={saving ? t('programBuilder.saving') : t('programBuilder.save')} onPress={() => void save()} />
          <Pressable onPress={() => { setSessions([]); setEditingId(undefined); setName(''); setError(''); }} accessibilityRole="button"><Text style={[styles.cancel, { color: palette.textMuted }]}>{t('programBuilder.closeEditor')}</Text></Pressable>
        </Card>
      </> : null}
    </Screen>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, { backgroundColor: selected ? palette.accent : palette.surface, borderColor: selected ? palette.accentStrong : palette.border }]}><Text style={{ color: selected ? palette.accentText : palette.text, fontWeight: '700' }}>{label}</Text></Pressable>;
}

function NumberField({ label, value, onChange, allowZero = false }: { label: string; value: number; onChange: (value: number) => void; allowZero?: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <View style={styles.numberField}><Label>{label}</Label><TextInput accessibilityLabel={label} keyboardType="number-pad" value={String(value)} onChangeText={(text) => { const parsed = Number.parseInt(text, 10); if (Number.isInteger(parsed) && parsed >= (allowZero ? 0 : 1) && parsed <= 9999) onChange(parsed); }} style={[styles.numberInput, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]} /></View>;
}

function weekdayKey(day: Weekday): string {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day];
}

function targetLabel(metric: string, t: (key: string) => string): string {
  if (metric === 'time' || metric === 'time_load') return t('programBuilder.seconds');
  if (metric === 'distance') return t('programBuilder.meters');
  return t('programBuilder.reps');
}

const baseStyles = StyleSheet.create({
  savedCard: { gap: 14 }, savedHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 }, flex: { flex: 1, gap: 4 },
  programName: { fontSize: 20, fontWeight: '800' }, deleteText: { fontWeight: '800', padding: 4 },
  savedSession: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionName: { fontWeight: '700', fontSize: 15 }, startButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }, editLink: { alignSelf: 'flex-end', fontWeight: '800', padding: 4 },
  editor: { gap: 14 }, field: { gap: 8 }, input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, minHeight: 46, fontSize: 16 },
  dayCard: { padding: 14, gap: 14 }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, choice: { borderWidth: 1, minWidth: 39, paddingVertical: 8, paddingHorizontal: 9, alignItems: 'center', borderRadius: 10 },
  prescription: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, gap: 8 }, exerciseName: { flex: 1, fontWeight: '700' }, values: { flexDirection: 'row', gap: 8 },
  numberField: { flex: 1, gap: 5 }, numberInput: { borderWidth: 1, borderRadius: 10, padding: 9, textAlign: 'center', fontWeight: '700' }, picker: { gap: 4 },
  exerciseOption: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, cancel: { alignSelf: 'center', padding: 8, fontWeight: '700' },
});
