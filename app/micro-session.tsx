import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { defaultMicroTarget, getLastMicroSessionExercise, listMicroSessionExercises, listRecentMicroSessionExerciseIds, logMicroSession, pickRecent } from '../src/features/session/microSession';
import { ActionButton, Body, Card, Chip, Label, PageHeading, Screen, Icon } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { goBack } from '../src/shared/navigation/goBack';

type Exercise = Awaited<ReturnType<typeof listMicroSessionExercises>>[number];

export default function MicroSessionScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [all, setAll] = useState<Exercise[]>([]);
  const [filtered, setFiltered] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const selectedRef = useRef<Exercise | null>(null);
  const [recent, setRecent] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [value, setValue] = useState('3');
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const requestRef = useRef(0);
  const [message, setMessage] = useState<'done' | 'error' | null>(null);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  /** Loads the full exercise list, recent ids and the auto-selected exercise. Run once per focus and after a successful log. */
  const loadBase = useCallback(async () => {
    const [allItems, recentIds, preferred] = await Promise.all([
      listMicroSessionExercises(''), listRecentMicroSessionExerciseIds(5), getLastMicroSessionExercise(),
    ]);
    setAll(allItems);
    setRecent(pickRecent(recentIds, allItems, 5));
    const hadSelection = selectedRef.current !== null;
    const auto = allItems.find((item) => item.id === preferred) ?? allItems[0] ?? null;
    setSelected((current) => current ?? auto);
    if (!hadSelection && auto) setValue(defaultMicroTarget(auto.metric));
  }, []);
  useFocusEffect(useCallback(() => { void loadBase(); }, [loadBase]));

  // Query change re-runs only the filtered search; an empty query reuses the already-loaded `all` list.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let active = true;
    const requestId = ++requestRef.current;
    listMicroSessionExercises(query).then((items) => {
      if (!active || requestId !== requestRef.current) return;
      setFiltered(items.slice(0, 50));
    });
    return () => { active = false; };
  }, [query]);
  const exercises = query.trim() ? filtered : all.slice(0, 20);

  const timed = selected?.metric === 'time' || selected?.metric === 'time_load';
  const distance = selected?.metric === 'distance';
  const unit = timed ? t('micro.seconds') : distance ? t('micro.meters') : t('micro.reps');
  const increment = distance ? 1 : timed ? 5 : 1;

  const selectExercise = (exercise: Exercise) => {
    setSelected(exercise);
    setValue(defaultMicroTarget(exercise.metric));
    setMessage(null);
    Keyboard.dismiss();
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
      void loadBase();
    } catch {
      setMessage('error');
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  };

  const unitFor = (metric: string) => metric === 'time' || metric === 'time_load' ? t('micro.seconds') : metric === 'distance' ? t('micro.meters') : t('micro.reps');

  return (
    <Screen>
      <PageHeading title={t('micro.title')} subtitle={t('micro.subtitle')} />
      <Card>
        {selected ? <>
          <Text numberOfLines={1} style={[styles.selectedName, { color: palette.text }]}>{selected.name}</Text>
          <Body>{t('micro.value')} · {unit}</Body>
          <View style={styles.targetRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('micro.decrease')} onPress={() => setValue(String(Math.max(increment, Number(value) - increment)))} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Icon name="remove" size={18} color={palette.text} /></Pressable>
            <TextInput accessibilityLabel={`${t('micro.value')} ${unit}`} keyboardType="numbers-and-punctuation" value={value} onChangeText={setValue} style={[styles.value, { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text }]} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('micro.increase')} onPress={() => setValue(String(Number(value || 0) + increment))} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Icon name="add" size={18} color={palette.text} /></Pressable>
          </View>
          <ActionButton label={working ? t('micro.working') : t('micro.save')} onPress={() => void log()} />
          {message === 'done' ? <Body style={{ color: palette.accentStrong }}>{t('micro.done')}</Body> : message === 'error' ? <Body style={{ color: palette.warning }}>{t('micro.error')}</Body> : null}
        </> : <Body>{t('micro.empty')}</Body>}
      </Card>
      {recent.length > 0 && <View style={styles.section}>
        <Label>{t('micro.recent')}</Label>
        <View style={styles.chips}>{recent.map((exercise) => <Chip key={exercise.id} label={exercise.name} selected={exercise.id === selected?.id} onPress={() => selectExercise(exercise)} />)}</View>
      </View>}
      <View style={styles.section}>
        <Label>{t('micro.choose')}</Label>
        <TextInput accessibilityLabel={t('micro.search')} placeholder={t('micro.search')} placeholderTextColor={palette.textMuted} value={query} onChangeText={setQuery} style={[styles.search, { backgroundColor: palette.surfaceMuted, color: palette.text, borderColor: palette.border }]} />
        {exercises.length === 0 ? <Body>{t('micro.empty')}</Body> : exercises.map((exercise, index) => {
          const active = exercise.id === selected?.id;
          return <Pressable key={exercise.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => selectExercise(exercise)} style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
            <Text numberOfLines={1} style={[styles.itemName, { color: active ? palette.accentStrong : palette.text }]}>{exercise.name}</Text>
            <Text style={[styles.itemUnit, { color: palette.textMuted }]}>{unitFor(exercise.metric)}</Text>
            <View style={styles.check}>{active ? <Icon name="checkmark" size={18} color={palette.accentStrong} /> : null}</View>
          </Pressable>;
        })}
      </View>
      <ActionButton label={t('micro.back')} secondary onPress={() => goBack()} />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  selectedName: { fontSize: 18, fontFamily: 'Barlow_600SemiBold' },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginVertical: 10 },
  adjust: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  value: { width: 96, height: 46, borderWidth: 1, borderRadius: 14, textAlign: 'center', fontSize: 20, fontWeight: '700' },
  section: { gap: 8, marginVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  item: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemName: { flex: 1, fontSize: 15 },
  itemUnit: { fontSize: 13 },
  check: { width: 18 },
});
