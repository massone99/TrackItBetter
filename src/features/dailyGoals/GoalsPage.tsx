import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { startOfWeek, type DailyGoal, type GoalPeriod } from '../../domain/dailyGoals';
import { goalsOf, type DailyGoalsSnapshot } from './repository';
import { DailyGoalSheet, type GoalDraft } from './DailyGoalSheet';
import { GoalRow, GoalSegments, GoalsPeriodSwitch, useGoalText } from './DailyGoalViews';
import { useGoalT } from './period';
import { ActionButton, Body, EmptyState, FooterAction, ListGroup, PageHeading, Screen, Text, Toast } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { fonts } from '../../shared/theme/typography';
import { formatMinutes } from '../../shared/utils/format';

type Removed = { goal: DailyGoal; index: number; name: string };

/**
 * Totals to reach today (or this week) by category, movement group or movement tag, summed over every
 * set done in the period. The goals stay the same every day (or week) until changed; a tap on one
 * opens its actions in place. The daily and the weekly goals are two pages of this one screen.
 */
export function GoalsPage({ period }: { period: GoalPeriod }) {
  const store = goalsOf(period);
  const tg = useGoalT(period);
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const goalText = useGoalText();
  const [snapshot, setSnapshot] = useState<DailyGoalsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<GoalDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void store.snapshot().then((next) => { setSnapshot(next); setFailed(false); }, () => setFailed(true));
  }, [store]);
  useFocusEffect(load);
  const hideToast = useCallback(() => setRemoved(null), []);

  /** Runs a change, shows an error if it fails, then reloads. */
  const change = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);
    } catch {
      setError(t('dailyGoals.saveError'));
    }
    load();
  };

  const openSheet = (draft: GoalDraft | null) => { setEditing(draft); setSheetOpen(true); };
  const save = (draft: GoalDraft) => { setSheetOpen(false); void change(() => store.put(draft)); };
  const remove = (goal: DailyGoal, name: string) => void change(async () => {
    const result = await store.remove(goal.id);
    if (result) setRemoved({ ...result, name });
    setExpanded(null);
  });
  const undo = () => { if (removed) void change(() => store.restore(removed.goal, removed.index)); };
  const duplicate = (id: string) => void change(async () => {
    const copy = await store.duplicate(id);
    if (copy) setExpanded(copy.id);
  });

  const dayFormat = { weekday: 'short', day: 'numeric', month: 'short' } as const;
  const now = new Date();
  const monday = startOfWeek(now);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const dateText = period === 'week'
    ? `${monday.toLocaleDateString(i18n.language, dayFormat)} – ${sunday.toLocaleDateString(i18n.language, dayFormat)}`
    : now.toLocaleDateString(i18n.language, dayFormat);
  const progress = snapshot?.progress ?? [];
  const reached = progress.filter((item) => item.reached).length;
  const stats = snapshot
    ? [dateText, tg('sessionsToday', { count: snapshot.sessions }), ...(snapshot.seconds > 0 ? [t('dailyGoals.timed', { time: formatMinutes(snapshot.seconds) })] : []), tg('sameEveryDay')].join(' · ')
    : dateText;

  return (
    <Screen
      overlay={<Toast message={removed ? t('dailyGoals.deleted', { name: removed.name }) : null} actionLabel={t('dailyGoals.undo')} onAction={undo} onHide={hideToast} bottomOffset={88} />}
      footer={
        <>
          <FooterAction icon="add" label={t('dailyGoals.goal')} secondary onPress={() => openSheet(null)} />
          <FooterAction icon="flash-outline" label={t('dailyGoals.miniSession')} onPress={() => router.push('/micro-session')} />
        </>
      }
    >
      <GoalsPeriodSwitch period={period} />
      <PageHeading
        title={tg('title')}
        action={progress.length > 0 ? <Text style={[styles.count, { color: reached === progress.length ? palette.success : palette.accentStrong }]}>{`${reached}/${progress.length}`}</Text> : undefined}
      />
      {progress.length > 0 ? <GoalSegments progress={progress} /> : null}
      <Body style={styles.stats}>{stats}</Body>
      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      {failed ? (
        <EmptyState icon="alert-circle-outline" title={t('common.loadError')} body={t('common.loadErrorBody')} action={<ActionButton icon="refresh" label={t('common.tryAgain')} onPress={load} />} />
      ) : !snapshot ? (
        <ActivityIndicator color={palette.accent} />
      ) : progress.length === 0 ? (
        <EmptyState icon="flag-outline" title={tg('emptyTitle')} body={tg('emptyBody')} action={<ActionButton icon="add" label={t('dailyGoals.add')} onPress={() => openSheet(null)} />} />
      ) : (
        <ListGroup>
          <View>
            {progress.map((item, index) => (
              <GoalRow
                key={item.goal.id}
                period={period}
                progress={item}
                expanded={expanded === item.goal.id}
                first={index === 0}
                last={index === progress.length - 1}
                onToggle={() => setExpanded((current) => (current === item.goal.id ? null : item.goal.id))}
                onTarget={(target) => void change(() => store.put({ ...item.goal, target }))}
                onDetails={() => router.push({ pathname: period === 'week' ? '/weekly-goal/[id]' : '/daily-goal/[id]', params: { id: item.goal.id } })}
                onEdit={() => openSheet(item.goal)}
                onDuplicate={() => duplicate(item.goal.id)}
                onMove={(delta) => void change(() => store.move(item.goal.id, delta))}
                onDelete={() => remove(item.goal, goalText(item).name)}
              />
            ))}
          </View>
        </ListGroup>
      )}
      <DailyGoalSheet
        period={period}
        key={sheetOpen ? `open-${editing?.id ?? 'new'}` : 'closed'}
        visible={sheetOpen}
        initial={editing}
        onSave={save}
        onClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  count: { fontFamily: fonts.display, fontSize: 28 },
  stats: { fontSize: 14 },
});
