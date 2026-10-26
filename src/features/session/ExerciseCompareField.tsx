import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { getExerciseHistory, type ExerciseHistorySession } from '../analytics/repository';
import { HistoryRow } from '../exercises/HistoryRow';
import { ActionButton, Body, MenuGroup, SegmentedControl } from '../../shared/components/ui';
import { readCompareMode, type CompareMode } from '../../shared/settings/preferences';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ComparePicker } from './ComparePicker';
import { setEntryCompareWorkout, type SessionExercise } from './repository';
import { radii } from '../../shared/theme/tokens';

type Mode = CompareMode | 'pick';

/**
 * What "vs last time" uses for this exercise: its latest time in this workout (same name, e.g. the same
 * program day), its latest time in any workout, or one past workout picked from a short list.
 * Starts from the Profile default.
 */
export function ExerciseCompareField({ exercise, workoutId, workoutName = '', onChanged }: { exercise: SessionExercise; workoutId: string; workoutName?: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const stored = exercise.compareWorkoutId ?? null;
  const [mode, setMode] = useState<Mode>(stored === '@session' || stored === '@any' ? (stored.slice(1) as CompareMode) : stored ? 'pick' : readCompareMode());
  const [pickedId, setPickedId] = useState<string | null>(stored && !stored.startsWith('@') ? stored : null);
  const [workouts, setWorkouts] = useState<ExerciseHistorySession[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    getExerciseHistory(exercise.exerciseId).then((list) => { if (alive) setWorkouts(list.filter((item) => item.workoutId !== workoutId)); }).catch(() => { if (alive) setWorkouts([]); });
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
  const chosen = workouts?.find((item) => item.workoutId === pickedId) ?? null;
  return (
    <MenuGroup title={t('compare.title')}>
      <SegmentedControl value={mode} onChange={choose} options={[
        { value: 'session', label: t('compare.modeWorkout') },
        { value: 'any', label: t('compare.modeExercise') },
        ...(canPick || mode === 'pick' ? [{ value: 'pick' as const, label: t('compare.modePick') }] : []),
      ]} />
      {mode === 'pick' ? (
        <>
          {chosen ? (
            <View style={[styles.list, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <HistoryRow session={chosen} older={workouts?.[workouts.indexOf(chosen) + 1]} exerciseId={exercise.exerciseId} metric={exercise.metric} locale={i18n.language} first selected onSelect={() => setOpen(true)} />
            </View>
          ) : null}
          <ActionButton secondary icon="search-outline" label={t('compare.choose')} onPress={() => setOpen(true)} />
          <ComparePicker visible={open} onClose={() => setOpen(false)} sessions={workouts ?? []} metric={exercise.metric} exerciseId={exercise.exerciseId} currentName={workoutName} pickedId={pickedId} onPick={pick} />
        </>
      ) : null}
      <Body>{t(mode === 'session' ? 'compare.workoutHint' : mode === 'any' ? 'compare.exerciseHint' : 'compare.pickHint')}</Body>
    </MenuGroup>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radii.control, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
