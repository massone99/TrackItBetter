import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { DailyGoal } from '../src/domain/dailyGoals';
import { duplicateDailyGoal, getDailyGoalsSnapshot, moveDailyGoal, putDailyGoal, removeDailyGoal, restoreDailyGoal, type DailyGoalsSnapshot } from '../src/features/dailyGoals/repository';
import { DailyGoalSheet, type GoalDraft } from '../src/features/dailyGoals/DailyGoalSheet';
import { GoalRow, GoalSegments, useGoalText } from '../src/features/dailyGoals/DailyGoalViews';
import { ActionButton, Body, EmptyState, FooterAction, ListGroup, PageHeading, Screen, Text, Toast } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { fonts } from '../src/shared/theme/typography';
import { formatMinutes } from '../src/shared/utils/format';

type Removed = { goal: DailyGoal; index: number; name: string };

/**
 * Totals to reach today by category, movement group or movement tag, summed over every set done today.
 * The goals stay the same every day until changed; a tap on one opens its actions in place.
 */
export default function DailyGoalsScreen() {
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
    void getDailyGoalsSnapshot().then((next) => { setSnapshot(next); setFailed(false); }, () => setFailed(true));
  }, []);
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
  const save = (draft: GoalDraft) => { setSheetOpen(false); void change(() => putDailyGoal(draft)); };
  const remove = (goal: DailyGoal, name: string) => void change(async () => {
    const result = await removeDailyGoal(goal.id);
    if (result) setRemoved({ ...result, name });
    setExpanded(null);
  });
  const undo = () => { if (removed) void change(() => restoreDailyGoal(removed.goal, removed.index)); };
  const duplicate = (id: string) => void change(async () => {
    const copy = await duplicateDailyGoal(id);
    if (copy) setExpanded(copy.id);
  });

  const dateText = new Date().toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const progress = snapshot?.progress ?? [];
  const reached = progress.filter((item) => item.reached).length;
  const stats = snapshot
    ? [dateText, t('dailyGoals.sessionsToday', { count: snapshot.sessions }), ...(snapshot.seconds > 0 ? [t('dailyGoals.timed', { time: formatMinutes(snapshot.seconds) })] : []), t('dailyGoals.sameEveryDay')].join(' · ')
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
      <PageHeading
        title={t('dailyGoals.title')}
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
        <EmptyState icon="flag-outline" title={t('dailyGoals.emptyTitle')} body={t('dailyGoals.emptyBody')} action={<ActionButton icon="add" label={t('dailyGoals.add')} onPress={() => openSheet(null)} />} />
      ) : (
        <ListGroup>
          <View>
            {progress.map((item, index) => (
              <GoalRow
                key={item.goal.id}
                progress={item}
                expanded={expanded === item.goal.id}
                first={index === 0}
                last={index === progress.length - 1}
                onToggle={() => setExpanded((current) => (current === item.goal.id ? null : item.goal.id))}
                onTarget={(target) => void change(() => putDailyGoal({ ...item.goal, target }))}
                onDetails={() => router.push({ pathname: '/daily-goal/[id]', params: { id: item.goal.id } })}
                onEdit={() => openSheet(item.goal)}
                onDuplicate={() => duplicate(item.goal.id)}
                onMove={(delta) => void change(() => moveDailyGoal(item.goal.id, delta))}
                onDelete={() => remove(item.goal, goalText(item).name)}
              />
            ))}
          </View>
        </ListGroup>
      )}
      <DailyGoalSheet
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
