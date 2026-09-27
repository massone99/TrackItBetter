import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { getLastMicroSessionExercise, listMicroSessionExercises, logMicroSession } from '../src/features/session/microSession';
import { ActionButton, Body, Card, Heading, Label, PageHeading, Screen, Icon } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { goBack } from '../src/shared/navigation/goBack';

type Exercise = Awaited<ReturnType<typeof listMicroSessionExercises>>[number];

export default function MicroSessionScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const italian = (i18n.resolvedLanguage ?? i18n.language).startsWith('it');
  const copy = italian ? {
    title: 'Micro-sessione', subtitle: 'Registra una serie breve e di qualità, lontano dal cedimento.', search: 'Cerca un esercizio', value: 'Obiettivo facile', save: 'Registra micro-sessione', working: 'Salvataggio…', done: 'Micro-sessione registrata.', error: 'Impossibile registrare. Termina prima l’allenamento attivo e riprova.', empty: 'Nessun esercizio trovato.', choose: 'Scegli un movimento', reps: 'Ripetizioni', seconds: 'Secondi', meters: 'Metri', detail: 'Scegli un movimento e un obiettivo gestibile. Ogni registrazione crea una micro-sessione completata nello storico.', back: 'Indietro',
  } : {
    title: 'Micro-session', subtitle: 'Log one short, high-quality set and stay well away from failure.', search: 'Search an exercise', value: 'Easy target', save: 'Log micro-session', working: 'Saving…', done: 'Micro-session logged.', error: 'Could not log it. Finish the active workout first, then try again.', empty: 'No exercises found.', choose: 'Choose a movement', reps: 'Reps', seconds: 'Seconds', meters: 'Meters', detail: 'Choose a movement and a comfortable target. Each log creates a completed micro-session in your history.', back: 'Back',
  };
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [value, setValue] = useState('3');
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const requestRef = useRef(0);
  const [message, setMessage] = useState<'done' | 'error' | null>(null);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    const [items, preferred] = await Promise.all([listMicroSessionExercises(query), getLastMicroSessionExercise()]);
    if (requestId !== requestRef.current) return;
    setExercises(items.slice(0, 100));
    if (!selectedId) setSelectedId(items.some((item) => item.id === preferred) ? preferred! : items[0]?.id ?? '');
  }, [query, selectedId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const selected = useMemo(() => exercises.find((exercise) => exercise.id === selectedId), [exercises, selectedId]);
  const timed = selected?.metric === 'time' || selected?.metric === 'time_load';
  const distance = selected?.metric === 'distance';
  const unit = timed ? copy.seconds : distance ? copy.meters : copy.reps;
  const increment = distance ? 1 : timed ? 5 : 1;

  const selectExercise = (exercise: Exercise) => {
    setSelectedId(exercise.id);
    const hold = exercise.metric === 'time' || exercise.metric === 'time_load';
    setValue(hold || exercise.metric === 'distance' ? '10' : '3');
    setMessage(null);
  };

  const log = async () => {
    if (workingRef.current) return;
    const parsed = Number(value.trim().replace(',', '.'));
    if (!selected || !Number.isFinite(parsed) || parsed <= 0) return;
    workingRef.current = true;
    setWorking(true);
    setMessage(null);
    try {
      await logMicroSession(selected.id, parsed);
      setMessage('done');
    } catch {
      setMessage('error');
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  };

  return (
    <Screen>
      <PageHeading title={copy.title} subtitle={copy.subtitle} />
      <Card>
        <Body>{copy.detail}</Body>
        <TextInput accessibilityLabel={copy.search} placeholder={copy.search} placeholderTextColor={palette.textMuted} value={query} onChangeText={setQuery} style={[styles.search, { backgroundColor: palette.surfaceMuted, color: palette.text, borderColor: palette.border }]} />
        <Label>{copy.choose}</Label>
        {exercises.length === 0 ? <Body>{copy.empty}</Body> : exercises.map((exercise) => {
          const active = exercise.id === selectedId;
          return <Pressable key={exercise.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => selectExercise(exercise)} style={[styles.choice, { backgroundColor: active ? palette.accent : palette.surfaceMuted, borderColor: active ? palette.accentStrong : palette.border }]}>
            <View style={styles.choiceText}><Heading style={{ color: active ? palette.accentText : palette.text }}>{exercise.name}</Heading><Body style={{ color: active ? palette.accentText : palette.textMuted }}>{t(`library.category.${exercise.category}`)} · {t(`metric.${exercise.metric}`)}</Body></View>
            <Icon name={active ? 'checkmark' : 'add'} size={20} color={active ? palette.accentText : palette.accentStrong} />
          </Pressable>;
        })}
      </Card>
      {selected ? <Card>
        <Label>{copy.value} · {unit}</Label>
        <View style={styles.targetRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={italian ? 'Diminuisci obiettivo' : 'Decrease target'} onPress={() => setValue(String(Math.max(increment, Number(value) - increment)))} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Text style={{ color: palette.text, fontSize: 22, fontWeight: '800' }}>−</Text></Pressable>
          <TextInput accessibilityLabel={`${copy.value} ${unit}`} keyboardType="numbers-and-punctuation" value={value} onChangeText={setValue} style={[styles.value, { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={italian ? 'Aumenta obiettivo' : 'Increase target'} onPress={() => setValue(String(Number(value || 0) + increment))} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Text style={{ color: palette.text, fontSize: 22, fontWeight: '800' }}>＋</Text></Pressable>
        </View>
        <ActionButton label={working ? copy.working : copy.save} onPress={() => void log()} />
        {message === 'done' ? <Body style={{ color: palette.accentStrong }}>{copy.done}</Body> : message === 'error' ? <Body style={{ color: palette.warning }}>{copy.error}</Body> : null}
      </Card> : null}
      <ActionButton label={copy.back} secondary onPress={() => goBack()} />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  search: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13 },
  choice: { minHeight: 64, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  choiceText: { flex: 1, gap: 3 },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  adjust: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  value: { width: 120, height: 52, borderWidth: 1, borderRadius: 15, textAlign: 'center', fontSize: 22, fontWeight: '800' },
});
