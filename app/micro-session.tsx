import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { HoldDurationField } from '../src/shared/components/DateTimePickers';
import { WorkoutInProgressSheet } from '../src/features/session/WorkoutInProgressSheet';
import { getActiveWorkout } from '../src/features/session/repository';
import { defaultMicroTarget, getLastMicroSessionExercise, listMicroSessionExercises, listRecentMicroSessionExerciseIds, logMicroSessionItems, pickRecent } from '../src/features/session/microSession';
import { ActionButton, Body, Card, Chip, Icon, IconButton, Label, NumberEdit, PageHeading, Screen, tapFeedback } from '../src/shared/components/ui';
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
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [all, setAll] = useState<Exercise[]>([]);
  const [filtered, setFiltered] = useState<Exercise[]>([]);
  // The exercises of this micro-session, each with its one set; the last used one is added on open.
  const [items, setItems] = useState<MicroItem[]>([]);
  const itemsRef = useRef<MicroItem[]>([]);
  const [recent, setRecent] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const requestRef = useRef(0);
  const [message, setMessage] = useState<'done' | 'error' | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => { itemsRef.current = items; }, [items]);

  /** Loads the full exercise list, recent ids and the auto-added exercise. Run once per focus and after a successful log. */
  const loadBase = useCallback(async () => {
    const [allItems, recentIds, preferred] = await Promise.all([
      listMicroSessionExercises(''), listRecentMicroSessionExerciseIds(5), getLastMicroSessionExercise(),
    ]);
    setAll(allItems);
    setRecent(pickRecent(recentIds, allItems, 5));
    const auto = allItems.find((item) => item.id === preferred) ?? allItems[0] ?? null;
    if (itemsRef.current.length === 0 && auto) setItems([newItem(auto)]);
  }, []);
  useFocusEffect(useCallback(() => { void loadBase(); }, [loadBase]));

  // Query change re-runs only the filtered search; an empty query reuses the already-loaded `all` list.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let active = true;
    const requestId = ++requestRef.current;
    listMicroSessionExercises(query).then((found) => {
      if (!active || requestId !== requestRef.current) return;
      setFiltered(found.slice(0, 50));
    });
    return () => { active = false; };
  }, [query]);
  const exercises = query.trim() ? filtered : all.slice(0, 20);
  const chosen = new Set(items.map((item) => item.exercise.id));

  /** Adds an exercise to the session; tapping one already in it removes it. */
  const toggleExercise = (exercise: Exercise) => {
    tapFeedback();
    setMessage(null);
    setItems((current) => current.some((item) => item.exercise.id === exercise.id)
      ? current.filter((item) => item.exercise.id !== exercise.id)
      : [...current, newItem(exercise)]);
    Keyboard.dismiss();
  };
  const update = (id: string, patch: Partial<MicroItem>) =>
    setItems((current) => current.map((item) => (item.exercise.id === id ? { ...item, ...patch } : item)));

  const log = async () => {
    if (workingRef.current || items.length === 0) return;
    const parsed = items.map((item) => ({ item, value: Number(item.value.trim().replace(',', '.')) }));
    if (parsed.some(({ value }) => !Number.isFinite(value) || value <= 0)) return;
    workingRef.current = true;
    setWorking(true);
    setMessage(null);
    try {
      const open = await getActiveWorkout();
      if (open) { setBlockedBy({ id: open.id, name: open.name }); return; }
      tapFeedback('success');
      await logMicroSessionItems(parsed.map(({ item, value }) => ({
        exerciseId: item.exercise.id,
        value,
        loadKg: item.exercise.metric === 'distance' ? 0 : item.loadKg,
        rpe: item.rpe,
      })));
      setMessage('done');
      // The same exercises stay for the next round, without last round's RPE.
      setItems((current) => current.map((item) => ({ ...item, rpe: null })));
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
      <Card style={styles.card}>
        {items.length === 0 ? <Body>{t('micro.pickFirst')}</Body> : items.map((item, index) => (
          <MicroItemRow
            key={item.exercise.id}
            item={item}
            first={index === 0}
            onChange={(patch) => { setMessage(null); update(item.exercise.id, patch); }}
            onRemove={() => toggleExercise(item.exercise)}
          />
        ))}
        {items.length > 0 ? (
          <ActionButton
            icon="checkmark"
            label={working ? t('micro.working') : t('micro.saveCount', { count: items.length })}
            disabled={working}
            onPress={() => void log()}
          />
        ) : null}
        {message === 'done' ? <Body style={{ color: palette.accentStrong }}>{t('micro.done')}</Body> : message === 'error' ? <Body style={{ color: palette.warning }}>{t('micro.error')}</Body> : null}
      </Card>
      {recent.length > 0 && <View style={styles.section}>
        <Label>{t('micro.recent')}</Label>
        <View style={styles.chips}>{recent.map((exercise) => <Chip key={exercise.id} label={exercise.name} selected={chosen.has(exercise.id)} onPress={() => toggleExercise(exercise)} />)}</View>
      </View>}
      <View style={styles.section}>
        <Label>{t('micro.choose')}</Label>
        <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel={t('micro.search')} placeholder={t('micro.search')} placeholderTextColor={palette.textMuted} value={query} onChangeText={setQuery} style={[styles.search, { backgroundColor: palette.surfaceMuted, color: palette.text, borderColor: palette.border }]} />
        {exercises.length === 0 ? <Body>{t('micro.empty')}</Body> : exercises.map((exercise, index) => {
          const active = chosen.has(exercise.id);
          return <Pressable key={exercise.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => toggleExercise(exercise)} onLongPress={() => openExercisePage(exercise.id)} style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
            <Text numberOfLines={1} style={[styles.itemName, { color: active ? palette.accentStrong : palette.text }]}>{exercise.name}</Text>
            <Text style={[styles.itemUnit, { color: palette.textMuted }]}>{unitFor(exercise.metric)}</Text>
            <View style={styles.check}><Icon name={active ? 'checkmark-circle' : 'add-circle-outline'} size={20} color={active ? palette.accentStrong : palette.textMuted} /></View>
          </Pressable>;
        })}
      </View>
      <ActionButton label={t('micro.back')} secondary onPress={() => goBack()} />
    </Screen>
  );
}

type MicroItem = { exercise: Exercise; value: string; loadKg: number; rpe: number | null };

const newItem = (exercise: Exercise): MicroItem => ({ exercise, value: defaultMicroTarget(exercise.metric), loadKg: 0, rpe: null });

/** One exercise of the micro-session: its name and remove button, then the workout's set row and RPE. */
function MicroItemRow({ item, first, onChange, onRemove }: { item: MicroItem; first: boolean; onChange: (patch: Partial<MicroItem>) => void; onRemove: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const sets = useScaledStyles(setEntryStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { exercise, value, loadKg, rpe } = item;
  const timed = exercise.metric === 'time' || exercise.metric === 'time_load';
  const distance = exercise.metric === 'distance';
  const unit = timed ? t('micro.seconds') : distance ? t('micro.meters') : t('micro.reps');
  const increment = distance ? 1 : timed ? 5 : 1;
  return (
    <View style={[styles.itemBlock, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 12 }]}>
      <View style={styles.itemHead}>
        <Text numberOfLines={1} style={[styles.selectedName, { color: palette.text }]}>{exercise.name}</Text>
        <IconButton icon="close" tone="plain" label={t('micro.remove', { name: exercise.name })} onPress={onRemove} />
      </View>
      {/* The same set row as a workout: value · kg, then RPE. */}
      <View style={sets.columns}>
        <Label style={[sets.colValue, sets.colHeader]}>{timed ? t('logger.holdCol') : distance ? t('logger.distanceCol') : t('logger.repsCol')}</Label>
        {distance ? null : <Label style={[sets.colLoad, sets.colHeader]}>{t('logger.kgCol')}</Label>}
      </View>
      <View style={sets.row}>
        <View style={[sets.colValue, sets.stepper]}>
          <StepButton icon="remove" label={`${t('micro.decrease')} · ${exercise.name}`} onPress={(multiplier) => onChange({ value: String(Math.max(increment, Number(value) - increment * multiplier)) })} />
          {timed ? (
            <HoldDurationField compact label={`${t('micro.value')} · ${exercise.name}`} value={Number(value) || 0} min={1} onChange={(seconds) => onChange({ value: String(seconds) })} />
          ) : (
            <NumberEdit value={Number(value) || 0} display={value} label={`${t('micro.value')} ${unit} · ${exercise.name}`} onCommit={(next) => onChange({ value: String(distance ? next : Math.round(next)) })} style={[sets.value, { color: palette.text }]} />
          )}
          <StepButton icon="add" label={`${t('micro.increase')} · ${exercise.name}`} onPress={(multiplier) => onChange({ value: String(Number(value || 0) + increment * multiplier) })} />
        </View>
        {distance ? null : (
          <View style={[sets.colLoad, sets.stepper]}>
            <StepButton icon="remove" label={`${t('history.addedLoad')} − · ${exercise.name}`} onPress={(multiplier) => onChange({ loadKg: Number((loadKg - LOAD_STEP_KG * multiplier).toFixed(2)) })} />
            <NumberEdit value={loadKg} display={loadCell(loadKg)} allowNegative label={`${t('history.addedLoad')} · ${exercise.name}`} onCommit={(next) => onChange({ loadKg: next })} style={[sets.loadValue, { color: loadKg === 0 ? palette.textMuted : palette.text }]} />
            <StepButton icon="add" label={`${t('history.addedLoad')} + · ${exercise.name}`} onPress={(multiplier) => onChange({ loadKg: Number((loadKg + LOAD_STEP_KG * multiplier).toFixed(2)) })} />
          </View>
        )}
      </View>
      <RpePicker compact value={rpe} onChange={(next) => onChange({ rpe: next })} />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: { gap: 12 },
  itemBlock: { gap: 4 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  selectedName: { flex: 1, fontSize: 18, fontFamily: 'Barlow_600SemiBold' },
  section: { gap: 8, marginVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, fontFamily: 'Barlow_400Regular' },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { flex: 1, fontSize: 15 },
  itemUnit: { fontSize: 13 },
  check: { width: 18 },
});
