import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { getExerciseHistory, type ExerciseHistorySession } from '../analytics/repository';
import { HistoryRow } from '../exercises/HistoryRow';
import { Body, MenuGroup, SegmentedControl, Text } from '../../shared/components/ui';
import { readCompareMode, type CompareMode } from '../../shared/settings/preferences';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { setEntryCompareWorkout, type SessionExercise } from './repository';

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
  const [workouts, setWorkouts] = useState<ExerciseHistorySession[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    getExerciseHistory(exercise.exerciseId, LOADED).then((list) => { if (alive) setWorkouts(list.filter((item) => item.workoutId !== workoutId)); }).catch(() => { if (alive) setWorkouts([]); });
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
  return (
    <MenuGroup title={t('compare.title')}>
      <SegmentedControl value={mode} onChange={choose} options={[
        { value: 'session', label: t('compare.modeWorkout') },
        { value: 'any', label: t('compare.modeExercise') },
        ...(canPick || mode === 'pick' ? [{ value: 'pick' as const, label: t('compare.modePick') }] : []),
      ]} />
      {mode === 'pick' ? (
        <View style={[styles.list, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          {shown.map((item, index) => (
            <HistoryRow
              key={item.workoutId}
              session={item}
              older={workouts?.[workouts.indexOf(item) + 1]}
              exerciseId={exercise.exerciseId}
              metric={exercise.metric}
              locale={i18n.language}
              first={index === 0}
              selected={item.workoutId === pickedId}
              onSelect={() => pick(item.workoutId)}
            />
          ))}
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
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  moreText: { fontFamily: fonts.semibold, fontSize: 14 },
});
