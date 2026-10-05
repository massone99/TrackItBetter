import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { HoldDurationField } from '../src/shared/components/DateTimePickers';
import { WorkoutInProgressSheet } from '../src/features/session/WorkoutInProgressSheet';
import { getActiveWorkout } from '../src/features/session/repository';
import { defaultMicroTarget, getLastMicroSessionExercise, listMicroSessionExercises, listRecentMicroSessionExerciseIds, logMicroSession, pickRecent } from '../src/features/session/microSession';
import { ActionButton, Body, Card, Chip, Label, NumberEdit, PageHeading, Screen, Icon, tapFeedback } from '../src/shared/components/ui';
import { LOAD_STEP_KG, loadCell, setEntryStyles, StepButton } from '../src/features/session/SetEntry';
import { RpePicker } from '../src/features/session/RpePicker';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { goBack } from '../src/shared/navigation/goBack';
import { MAX_FONT_SCALE } from '../src/shared/theme/scale';
import { openExercisePage } from '../src/features/exercises/openExercise';

type Exercise = Awaited<ReturnType<typeof listMicroSessionExercises>>[number];

export default function MicroSessionScreen() {
  const styles = useScaledStyles(baseStyles);
  const sets = useScaledStyles(setEntryStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [all, setAll] = useState<Exercise[]>([]);
  const [filtered, setFiltered] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const selectedRef = useRef<Exercise | null>(null);
  const [recent, setRecent] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [value, setValue] = useState('3');
  const [loadKg, setLoadKg] = useState(0);
  const [rpe, setRpe] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const requestRef = useRef(0);
  const [message, setMessage] = useState<'done' | 'error' | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);

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
    setLoadKg(0);
    setRpe(null);
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
      const open = await getActiveWorkout();
      if (open) { setBlockedBy({ id: open.id, name: open.name }); return; }
      tapFeedback('success');
      await logMicroSession(selected.id, parsed, { loadKg: distance ? 0 : loadKg, rpe });
      setMessage('done');
      setRpe(null);
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
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
      <PageHeading title={t('micro.title')} subtitle={t('micro.subtitle')} />
      <Card>
        {selected ? <>
          <Text numberOfLines={1} style={[styles.selectedName, { color: palette.text }]}>{selected.name}</Text>
          {/* The same set row as a workout: set · value · kg · done, then RPE. */}
          <View style={sets.columns}>
            <Label style={[sets.colSet, sets.colHeader]}>{t('logger.setCol')}</Label>
            <Label style={[sets.colValue, sets.colHeader]}>{timed ? t('logger.holdCol') : distance ? t('logger.distanceCol') : t('logger.repsCol')}</Label>
            {distance ? null : <Label style={[sets.colLoad, sets.colHeader]}>{t('logger.kgCol')}</Label>}
            <View style={sets.colAction} />
          </View>
          <View style={sets.row}>
            <View style={sets.colSet}>
              <View style={[sets.badge, { backgroundColor: palette.surfaceMuted }]}><Text style={[sets.badgeText, { color: palette.text }]}>1</Text></View>
            </View>
            <View style={[sets.colValue, sets.stepper]}>
              <StepButton icon="remove" label={t('micro.decrease')} onPress={(multiplier) => setValue(String(Math.max(increment, Number(value) - increment * multiplier)))} />
              {timed ? (
                <HoldDurationField compact label={t('micro.value')} value={Number(value) || 0} min={1} onChange={(seconds) => setValue(String(seconds))} />
              ) : (
                <NumberEdit value={Number(value) || 0} display={value} label={`${t('micro.value')} ${unit}`} onCommit={(next) => setValue(String(distance ? next : Math.round(next)))} style={[sets.value, { color: palette.text }]} />
              )}
              <StepButton icon="add" label={t('micro.increase')} onPress={(multiplier) => setValue(String(Number(value || 0) + increment * multiplier))} />
            </View>
            {distance ? null : (
              <View style={[sets.colLoad, sets.stepper]}>
                <StepButton icon="remove" label={`${t('history.addedLoad')} −`} onPress={(multiplier) => setLoadKg((current) => Number((current - LOAD_STEP_KG * multiplier).toFixed(2)))} />
                <NumberEdit value={loadKg} display={loadCell(loadKg)} allowNegative label={t('history.addedLoad')} onCommit={setLoadKg} style={[sets.loadValue, { color: loadKg === 0 ? palette.textMuted : palette.text }]} />
                <StepButton icon="add" label={`${t('history.addedLoad')} +`} onPress={(multiplier) => setLoadKg((current) => Number((current + LOAD_STEP_KG * multiplier).toFixed(2)))} />
              </View>
            )}
            <View style={sets.colAction}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('micro.save')}
                accessibilityState={{ disabled: working, busy: working }}
                disabled={working}
                hitSlop={4}
                onPress={() => void log()}
                style={({ pressed }) => [sets.checkButton, { backgroundColor: palette.accent, opacity: working ? 0.5 : pressed ? 0.8 : 1 }]}
              >
                <Icon name="checkmark" size={20} color={palette.accentText} />
              </Pressable>
            </View>
          </View>
          <RpePicker compact value={rpe} onChange={setRpe} />
          {message === 'done' ? <Body style={{ color: palette.accentStrong }}>{t('micro.done')}</Body> : message === 'error' ? <Body style={{ color: palette.warning }}>{t('micro.error')}</Body> : null}
        </> : <Body>{t('micro.empty')}</Body>}
      </Card>
      {recent.length > 0 && <View style={styles.section}>
        <Label>{t('micro.recent')}</Label>
        <View style={styles.chips}>{recent.map((exercise) => <Chip key={exercise.id} label={exercise.name} selected={exercise.id === selected?.id} onPress={() => selectExercise(exercise)} />)}</View>
      </View>}
      <View style={styles.section}>
        <Label>{t('micro.choose')}</Label>
        <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel={t('micro.search')} placeholder={t('micro.search')} placeholderTextColor={palette.textMuted} value={query} onChangeText={setQuery} style={[styles.search, { backgroundColor: palette.surfaceMuted, color: palette.text, borderColor: palette.border }]} />
        {exercises.length === 0 ? <Body>{t('micro.empty')}</Body> : exercises.map((exercise, index) => {
          const active = exercise.id === selected?.id;
          return <Pressable key={exercise.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => selectExercise(exercise)} onLongPress={() => openExercisePage(exercise.id)} style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
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
  section: { gap: 8, marginVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, fontFamily: 'Barlow_400Regular' },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { flex: 1, fontSize: 15 },
  itemUnit: { fontSize: 13 },
  check: { width: 18 },
});
