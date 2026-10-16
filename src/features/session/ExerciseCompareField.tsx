import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Body, Chip, MenuGroup } from '../../shared/components/ui';
import { listComparableWorkouts, setEntryCompareWorkout, type ComparableWorkout, type SessionExercise } from './repository';

const SHOWN = 8;

/**
 * What the exercise is compared with ("vs last time"): the default (its latest time in the same session,
 * as chosen in the Profile) or, by hand, one of its past workouts.
 */
export function ExerciseCompareField({ exercise, workoutId, onChanged }: { exercise: SessionExercise; workoutId: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const [workouts, setWorkouts] = useState<ComparableWorkout[] | null>(null);
  const [chosen, setChosen] = useState(exercise.compareWorkoutId ?? null);
  useEffect(() => {
    let alive = true;
    listComparableWorkouts(exercise.exerciseId, workoutId, SHOWN).then((list) => { if (alive) setWorkouts(list); }).catch(() => { if (alive) setWorkouts([]); });
    return () => { alive = false; };
  }, [exercise.exerciseId, workoutId]);
  if (workouts === null || workouts.length === 0) return null;
  const choose = (next: string | null) => {
    setChosen(next);
    void setEntryCompareWorkout(exercise.entryId, next).then(onChanged);
  };
  const label = (item: ComparableWorkout) => `${item.startedAt.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} · ${item.name}`;
  return (
    <MenuGroup title={t('compare.title')}>
      <Body>{t('compare.help')}</Body>
      <View style={styles.chips}>
        <Chip label={t('compare.automatic')} selected={chosen === null} onPress={() => choose(null)} />
        {workouts.map((item) => <Chip key={item.workoutId} label={label(item)} selected={chosen === item.workoutId} onPress={() => choose(item.workoutId)} />)}
      </View>
    </MenuGroup>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
