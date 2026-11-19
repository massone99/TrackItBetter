import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { DailyGoal, DailyGoalProgress, GoalPeriod } from '../../domain/dailyGoals';
import type { GoalChange } from '../../domain/tagGoals';
import { Body, ListGroup, ListRow, SectionTitle } from '../../shared/components/ui';
import { spacing } from '../../shared/theme/tokens';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { DailyGoalSheet } from './DailyGoalSheet';
import { goalAmount } from './labels';
import { goalsOf } from './repository';

type Loaded = { progress: Record<GoalPeriod, DailyGoalProgress | null>; goals: Record<GoalPeriod, DailyGoal[]> };

/** First goal a new time goal starts from: a minute-ish a day, a quarter hour a week. */
const START_TARGET: Record<GoalPeriod, number> = { day: 180, week: 900 };

/**
 * "Time goals" on an exercise's page: how much of today's and this week's goal on this exercise is done,
 * and one tap to set or change each. Removing a goal is done from the goals list, which can undo it.
 */
export function ExerciseGoalsSection({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<GoalPeriod | null>(null);

  const load = useCallback(async () => {
    try {
      const [day, week] = await Promise.all([goalsOf('day').snapshot(), goalsOf('week').snapshot()]);
      const own = (items: readonly DailyGoalProgress[]) => items.find((item) => item.goal.scope === 'exercise' && item.goal.key === exerciseId) ?? null;
      setLoaded({ progress: { day: own(day.progress), week: own(week.progress) }, goals: { day: day.progress.map((item) => item.goal), week: week.progress.map((item) => item.goal) } });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [exerciseId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = async (period: GoalPeriod, change: GoalChange) => {
    setEditing(null);
    try { await goalsOf(period).apply(change); setFailed(false); } catch { setFailed(true); }
    await load();
  };

  const row = (period: GoalPeriod) => {
    const progress = loaded?.progress[period] ?? null;
    const title = t(period === 'day' ? 'exerciseGoals.today' : 'exerciseGoals.week');
    return (
      <ListRow
        key={period}
        icon={progress?.reached ? 'checkmark-circle' : 'flag-outline'}
        title={title}
        subtitle={progress ? `${goalAmount('minutes', progress.done)} / ${goalAmount('minutes', progress.goal.target)}` : t('exerciseGoals.set')}
        onPress={() => setEditing(period)}
      />
    );
  };

  return (
    <View style={styles.section}>
      <SectionTitle title={t('exerciseGoals.title')} />
      {failed ? <Body>{t('common.loadError')}</Body> : null}
      <ListGroup>{(['day', 'week'] as const).map(row)}</ListGroup>
      {editing ? (
        <DailyGoalSheet
          key={`${editing}-${loaded?.progress[editing]?.goal.id ?? 'new'}`}
          period={editing}
          visible
          initial={loaded?.progress[editing]?.goal ?? { scope: 'exercise', key: exerciseId, measure: 'minutes', target: START_TARGET[editing], label: exerciseName }}
          goals={loaded?.goals[editing] ?? []}
          onSave={(change) => void save(editing, change)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: { gap: spacing.md },
});
