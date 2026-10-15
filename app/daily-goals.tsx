import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getDailyGoalsSnapshot, putDailyGoal, type DailyGoalsSnapshot } from '../src/features/dailyGoals/repository';
import { DailyGoalSheet, type GoalDraft } from '../src/features/dailyGoals/DailyGoalSheet';
import { DailyGoalCard, DailyGoalRow } from '../src/features/dailyGoals/DailyGoalViews';
import { ActionButton, Body, EmptyState, FooterAction, ListGroup, PageHeading, Screen, SectionTitle, Text } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { fonts } from '../src/shared/theme/typography';
import { formatMinutes } from '../src/shared/utils/format';

/** Totals to reach today by category, movement group or movement tag, summed over every set done today. */
export default function DailyGoalsScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [snapshot, setSnapshot] = useState<DailyGoalsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void getDailyGoalsSnapshot().then((next) => { setSnapshot(next); setFailed(false); }, () => setFailed(true));
  }, []);
  useFocusEffect(load);

  const add = async (draft: GoalDraft) => {
    setAdding(false);
    try {
      await putDailyGoal(draft);
      setError(null);
    } catch {
      setError(t('dailyGoals.saveError'));
    }
    load();
  };

  const dateText = new Date().toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
  const progress = snapshot?.progress ?? [];
  const open = progress.filter((item) => !item.reached);
  const reached = progress.filter((item) => item.reached);

  return (
    <Screen
      footer={
        <>
          <FooterAction icon="add" label={t('dailyGoals.add')} secondary onPress={() => setAdding(true)} />
          <FooterAction icon="flash-outline" label={t('dailyGoals.miniSession')} onPress={() => router.push('/micro-session')} />
        </>
      }
    >
      <PageHeading title={t('dailyGoals.title')} subtitle={dateText.charAt(0).toUpperCase() + dateText.slice(1)} />
      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      {failed ? (
        <EmptyState icon="alert-circle-outline" title={t('common.loadError')} body={t('common.loadErrorBody')} action={<ActionButton icon="refresh" label={t('common.tryAgain')} onPress={load} />} />
      ) : !snapshot ? (
        <ActivityIndicator color={palette.accent} />
      ) : progress.length === 0 ? (
        <EmptyState icon="flag-outline" title={t('dailyGoals.emptyTitle')} body={t('dailyGoals.emptyBody')} action={<ActionButton icon="add" label={t('dailyGoals.add')} onPress={() => setAdding(true)} />} />
      ) : (
        <>
          <View style={[styles.hero, { backgroundColor: palette.hero }]}>
            <Text style={[styles.heroCount, { color: palette.heroText }]}>{t('dailyGoals.reachedCount', { done: reached.length, total: progress.length })}</Text>
            <Text style={[styles.heroLabel, { color: palette.heroTextMuted }]}>
              {t(reached.length === progress.length ? 'dailyGoals.allReached' : 'dailyGoals.reachedLabel')}
            </Text>
            <View style={[styles.heroTrack, { backgroundColor: palette.heroOverlay }]}>
              <View style={[styles.heroFill, { backgroundColor: palette.heroText, width: `${(reached.length / progress.length) * 100}%` }]} />
            </View>
            <Text style={[styles.heroLabel, { color: palette.heroTextMuted }]}>
              {t('dailyGoals.sessionsToday', { count: snapshot.sessions })}{snapshot.seconds > 0 ? ` · ${formatMinutes(snapshot.seconds)}` : ''}
            </Text>
          </View>
          {open.length > 0 ? (
            <>
              <SectionTitle title={t('dailyGoals.toDo')} />
              {open.map((item) => <DailyGoalCard key={item.goal.id} progress={item} onPress={() => router.push({ pathname: '/daily-goal/[id]', params: { id: item.goal.id } })} />)}
            </>
          ) : null}
          {reached.length > 0 ? (
            <>
              <SectionTitle title={t('dailyGoals.reached')} />
              <ListGroup>
                {reached.map((item) => <DailyGoalRow key={item.goal.id} progress={item} onPress={() => router.push({ pathname: '/daily-goal/[id]', params: { id: item.goal.id } })} />)}
              </ListGroup>
            </>
          ) : null}
        </>
      )}
      <DailyGoalSheet key={adding ? 'open' : 'closed'} visible={adding} initial={null} onSave={(draft) => void add(draft)} onClose={() => setAdding(false)} />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  hero: { borderRadius: 24, padding: 20, gap: 8 },
  heroCount: { fontFamily: fonts.display, fontSize: 44 },
  heroLabel: { fontSize: 15 },
  heroTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  heroFill: { height: '100%', borderRadius: 5 },
});
