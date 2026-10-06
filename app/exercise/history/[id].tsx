import { ShowMore, usePaged } from '../../../src/shared/components/paging';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Exercise } from '../../../src/db/schema';
import { getExerciseHistory, type ExerciseHistorySession } from '../../../src/features/analytics/repository';
import { getExerciseById } from '../../../src/features/exercises/repository';
import { Body, PageHeading, Screen, SectionTitle } from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { HistoryRow } from '../../../src/features/exercises/HistoryRow';

/** Every session of one exercise, grouped by month, newest first. */
export default function ExerciseHistoryRoute() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [sessions, setSessions] = useState<ExerciseHistorySession[] | null>(null);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void Promise.all([getExerciseById(id), getExerciseHistory(id)]).then(([found, history]) => {
      if (!mounted) return;
      setExercise(found);
      setSessions(history);
    });
    return () => { mounted = false; };
  }, [id]));

  // Long histories render in pages of 40 sessions.
  const page = usePaged(sessions ?? [], 40);
  if (!sessions || !exercise) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;

  const months = new Map<string, ExerciseHistorySession[]>();
  for (const session of page.shown) {
    const key = session.startedAt.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
    months.set(key, [...(months.get(key) ?? []), session]);
  }
  const setCount = sessions.reduce((sum, session) => sum + session.sets.length, 0);

  return (
    <Screen>
      <PageHeading title={exercise.name} subtitle={`${t('exerciseManage.allHistory', { count: sessions.length })} · ${t('exerciseManage.sessionSets', { count: setCount })}`} />
      {sessions.length === 0 ? <Body>{t('exerciseManage.historyEmpty')}</Body> : null}
      {[...months].map(([month, items]) => (
        <View key={month} style={styles.month}>
          <SectionTitle title={month.charAt(0).toUpperCase() + month.slice(1)} />
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {items.map((session, index) => <HistoryRow key={session.workoutId} session={session} metric={exercise.metric} locale={i18n.language} first={index === 0} />)}
          </View>
        </View>
      ))}
      <ShowMore remaining={page.remaining} onPress={page.more} />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  month: { gap: 10 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
});
