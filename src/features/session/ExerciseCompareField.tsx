import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Body, Icon, MenuGroup, SegmentedControl, Text } from '../../shared/components/ui';
import { readCompareMode, type CompareMode } from '../../shared/settings/preferences';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { listComparableWorkouts, setEntryCompareWorkout, type ComparableWorkout, type SessionExercise } from './repository';

type Mode = CompareMode | 'pick';

const LOADED = 30;
const SHOWN = 5;

/**
 * What "vs last time" uses for this exercise: its latest time in this workout (same name, e.g. the same
 * program day), its latest time in any workout, or one past workout picked from a short list.
 * Starts from the Profile default.
 */
export function ExerciseCompareField({ exercise, workoutId, onChanged }: { exercise: SessionExercise; workoutId: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const stored = exercise.compareWorkoutId ?? null;
  const [mode, setMode] = useState<Mode>(stored === '@session' || stored === '@any' ? (stored.slice(1) as CompareMode) : stored ? 'pick' : readCompareMode());
  const [pickedId, setPickedId] = useState<string | null>(stored && !stored.startsWith('@') ? stored : null);
  const [workouts, setWorkouts] = useState<ComparableWorkout[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    listComparableWorkouts(exercise.exerciseId, workoutId, LOADED).then((list) => { if (alive) setWorkouts(list); }).catch(() => { if (alive) setWorkouts([]); });
    return () => { alive = false; };
  }, [exercise.exerciseId, workoutId]);

  const save = (value: string) => { void setEntryCompareWorkout(exercise.entryId, value).then(onChanged); };
  const choose = (next: Mode) => {
    setMode(next);
    if (next !== 'pick') { save(`@${next}`); return; }
    // Picking starts on the newest workout, so the choice is never left without one.
    const first = pickedId ?? workouts?.[0]?.workoutId ?? null;
    if (first) { setPickedId(first); save(first); }
  };
  const pick = (id: string) => { setPickedId(id); save(id); };

  const canPick = (workouts?.length ?? 0) > 0;
  const shown = workouts ? (all ? workouts : workouts.slice(0, SHOWN)) : [];
  const date = (item: ComparableWorkout) => item.startedAt.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <MenuGroup title={t('compare.title')}>
      <SegmentedControl value={mode} onChange={choose} options={[
        { value: 'session', label: t('compare.modeWorkout') },
        { value: 'any', label: t('compare.modeExercise') },
        ...(canPick || mode === 'pick' ? [{ value: 'pick' as const, label: t('compare.modePick') }] : []),
      ]} />
      {mode === 'pick' ? (
        <View style={[styles.list, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          {shown.map((item, index) => {
            const selected = item.workoutId === pickedId;
            return (
              <Pressable
                key={item.workoutId}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${date(item)}, ${item.name}`}
                onPress={() => pick(item.workoutId)}
                style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }, selected && { backgroundColor: palette.accentSoft }, pressed && { opacity: 0.6 }]}
              >
                <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? palette.accentStrong : palette.textMuted} />
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={[styles.rowTitle, { color: palette.text }]}>{item.name}</Text>
                  <Text style={[styles.rowDate, { color: palette.textMuted }]}>{date(item)}</Text>
                </View>
              </Pressable>
            );
          })}
          {!all && (workouts?.length ?? 0) > SHOWN ? (
            <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={[styles.more, { borderTopColor: palette.border }]}>
              <Text style={[styles.moreText, { color: palette.accentStrong }]}>{t('compare.showMore', { count: (workouts?.length ?? 0) - SHOWN })}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Body>{t(mode === 'session' ? 'compare.workoutHint' : mode === 'any' ? 'compare.exerciseHint' : 'compare.pickHint')}</Body>
    </MenuGroup>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8 },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  rowDate: { fontFamily: fonts.body, fontSize: 13 },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  moreText: { fontFamily: fonts.semibold, fontSize: 14 },
});
