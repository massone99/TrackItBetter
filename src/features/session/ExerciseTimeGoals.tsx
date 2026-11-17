import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { ExerciseGoalProgress } from '../dailyGoals/repository';
import type { DailyGoalProgress } from '../../domain/dailyGoals';
import { goalAmount } from '../dailyGoals/labels';
import { Icon, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/**
 * Today's and this week's time goal of an exercise on its card: "Today 1:20 / 5:00 · Week 12:00 / 20:00",
 * green with a check once reached. Not the workout's own total goal ("Total goal"), which is per workout.
 */
export function ExerciseTimeGoals({ goals }: { goals: ExerciseGoalProgress }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={styles.row}>
      {goals.day ? <GoalChip period="day" progress={goals.day} /> : null}
      {goals.week ? <GoalChip period="week" progress={goals.week} /> : null}
    </View>
  );
}

function GoalChip({ period, progress }: { period: 'day' | 'week'; progress: DailyGoalProgress }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { goal, done, reached } = progress;
  const name = t(period === 'day' ? 'exerciseGoals.today' : 'exerciseGoals.week');
  const amount = `${goalAmount('minutes', done)} / ${goalAmount('minutes', goal.target)}`;
  return (
    <View
      accessible
      accessibilityLabel={t(reached ? 'exerciseGoals.lineReached' : 'exerciseGoals.line', { period: name, done: goalAmount('minutes', done), target: goalAmount('minutes', goal.target) })}
      style={[styles.chip, { backgroundColor: reached ? palette.successSoft : palette.surfaceMuted, borderColor: reached ? palette.success : palette.border }]}
    >
      {reached ? <Icon name="checkmark-circle" size={14} color={palette.success} /> : <Icon name="flag-outline" size={14} color={palette.textMuted} />}
      <Text style={[styles.text, { color: reached ? palette.success : palette.text }]}>{`${name} ${amount}`}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%', borderRadius: radii.control, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, minHeight: 28 },
  text: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
});
