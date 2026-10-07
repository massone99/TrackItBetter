import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ExercisePicker, type ExerciseChoice } from '../src/features/exercises/ExercisePicker';
import { WorkoutInProgressSheet } from '../src/features/session/WorkoutInProgressSheet';
import { listMicroSessionExercises, listRecentMicroSessionExerciseIds, pickRecent, startMicroSession } from '../src/features/session/microSession';
import { ActionButton, Body, Chip, EmptyState, FooterAction, Label, PageHeading, Screen, tapFeedback } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

type Exercise = Awaited<ReturnType<typeof listMicroSessionExercises>>[number];
type Picked = { id: string; name: string };

/**
 * Where a micro-session starts: choose N exercises, then it becomes an ordinary workout in
 * progress (the workout screen: sets, timers, rest, notes). Nothing is logged from here.
 */
export default function MicroSessionScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [recent, setRecent] = useState<Exercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    const [all, recentIds] = await Promise.all([listMicroSessionExercises(''), listRecentMicroSessionExerciseIds(5)]);
    setRecent(pickRecent(recentIds, all, 5));
  }, []);
  useFocusEffect(useCallback(() => { void loadRecent(); }, [loadRecent]));

  const included = new Set(picked.map((exercise) => exercise.id));
  const toggle = (exercise: Picked) => {
    tapFeedback();
    setPicked((current) => (current.some((item) => item.id === exercise.id) ? current.filter((item) => item.id !== exercise.id) : [...current, { id: exercise.id, name: exercise.name }]));
  };

  const start = async () => {
    if (starting || picked.length === 0) return;
    setStarting(true);
    setError(null);
    try {
      const result = await startMicroSession(picked.map((exercise) => exercise.id));
      if ('active' in result) { setBlockedBy(result.active); return; }
      router.replace({ pathname: '/workout/[id]', params: { id: result.workoutId } });
    } catch (reason) {
      setError(`${t('micro.error')} (${reason instanceof Error ? reason.message : String(reason)})`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <FooterAction icon="add" label={t('workout.addExercise')} secondary onPress={() => setPickerOpen(true)} />
          <FooterAction icon="play" label={starting ? t('programBuilder.starting') : t('micro.start', { count: picked.length })} disabled={picked.length === 0 || starting} onPress={() => void start()} />
        </>
      }
    >
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
      <PageHeading title={t('micro.title')} subtitle={t('micro.subtitle')} />
      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      {picked.length === 0 ? (
        <EmptyState icon="flash-outline" title={t('micro.emptyTitle')} body={t('micro.pickFirst')} action={<ActionButton icon="add" label={t('workout.addExercise')} onPress={() => setPickerOpen(true)} />} />
      ) : (
        <View style={styles.group}>
          <Label>{t('micro.chosen', { count: picked.length })}</Label>
          <View style={styles.chips}>
            {picked.map((exercise) => <Chip key={exercise.id} icon="close" label={exercise.name} selected accessibilityLabel={t('micro.removeChosen', { name: exercise.name })} onPress={() => toggle(exercise)} />)}
          </View>
        </View>
      )}
      {recent.length > 0 ? (
        <View style={styles.group}>
          <Label>{t('micro.recent')}</Label>
          <View style={styles.chips}>{recent.map((exercise) => <Chip key={exercise.id} label={exercise.name} selected={included.has(exercise.id)} onPress={() => toggle(exercise)} />)}</View>
        </View>
      ) : null}
      <ExercisePicker
        visible={pickerOpen}
        title={t('workout.addExercise')}
        subtitle={t('micro.subtitle')}
        include={(choice: ExerciseChoice) => !included.has(choice.id)}
        onChoose={(choice) => { setPickerOpen(false); toggle(choice); }}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
