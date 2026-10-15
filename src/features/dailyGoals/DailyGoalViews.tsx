import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DailyGoalProgress } from '../../domain/dailyGoals';
import { Card, Icon, ListRow, ProgressMeter, Text, tapFeedback } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { fonts } from '../../shared/theme/typography';
import { goalAmount, goalKeyLabel } from './labels';

/** "0:35 / 1:00" or "18 / 30 reps". */
export function useGoalText() {
  const { t } = useTranslation();
  return (progress: DailyGoalProgress) => {
    const { goal, done, remaining } = progress;
    const unit = goal.measure === 'reps' ? ` ${t('dailyGoals.repsUnit')}` : '';
    return {
      name: goalKeyLabel(goal, t),
      scope: t(`dailyGoals.scope.${goal.scope}`),
      amount: `${goalAmount(goal.measure, done)} / ${goalAmount(goal.measure, goal.target)}${unit}`,
      remaining: t('dailyGoals.remaining', { amount: `${goalAmount(goal.measure, remaining)}${unit}` }),
    };
  };
}

/** A goal still to reach: name, amount and a bar. */
export function DailyGoalCard({ progress, onPress }: { progress: DailyGoalProgress; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const text = useGoalText()(progress);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${text.name}, ${text.amount}, ${text.remaining}`} onPress={() => { tapFeedback(); onPress(); }}>
      <Card style={styles.card}>
        <View style={styles.head}>
          <View style={[styles.badge, { backgroundColor: palette.surfaceMuted }]}><Text style={[styles.badgeText, { color: palette.textMuted }]}>{text.scope}</Text></View>
          <Text style={[styles.name, { color: palette.text }]}>{text.name}</Text>
          <Text style={[styles.amount, { color: palette.text }]}>{text.amount}</Text>
        </View>
        <ProgressMeter value={progress.done} total={progress.goal.target} label={text.amount} />
        <Text style={[styles.remaining, { color: palette.textMuted }]}>{text.remaining}</Text>
      </Card>
    </Pressable>
  );
}

/** A reached goal, in a compact list. */
export function DailyGoalRow({ progress, onPress }: { progress: DailyGoalProgress; onPress: () => void }) {
  const { palette } = useTheme();
  const text = useGoalText()(progress);
  return <ListRow icon="checkmark" tint={palette.success} title={text.name} subtitle={`${text.scope} · ${text.amount}`} onPress={onPress} />;
}

const baseStyles = StyleSheet.create({
  card: { gap: 10 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontFamily: fonts.semibold },
  name: { flexGrow: 1, flexShrink: 1, fontSize: 17, fontFamily: fonts.semibold },
  amount: { fontSize: 20, fontFamily: fonts.display },
  remaining: { fontSize: 14 },
});

/** Today's goals on the Today screen: how many are reached and the ones still open. */
export function DailyGoalsSummary({ progress, onPress }: { progress: readonly DailyGoalProgress[]; onPress: () => void }) {
  const styles = useScaledStyles(summaryStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const goalText = useGoalText();
  const reached = progress.filter((item) => item.reached).length;
  const open = progress.filter((item) => !item.reached);
  const title = t('dailyGoals.title');
  const count = t('dailyGoals.reachedOf', { done: reached, total: progress.length });
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${count}`} onPress={() => { tapFeedback(); onPress(); }}>
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text style={[styles.count, { color: reached === progress.length ? palette.success : palette.accentStrong }]}>{`${reached}/${progress.length}`}</Text>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
            <Text style={[styles.sub, { color: palette.textMuted }]}>{reached === progress.length ? t('dailyGoals.allReached') : count}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={palette.textMuted} />
        </View>
        <ProgressMeter value={reached} total={progress.length} label={count} tone={reached === progress.length ? 'success' : 'accent'} />
        {open.length > 0 ? (
          <View style={styles.chips}>
            {open.slice(0, 3).map((item) => {
              const text = goalText(item);
              return <View key={item.goal.id} style={[styles.chip, { backgroundColor: palette.accentSoft }]}><Text style={[styles.chipText, { color: palette.accentStrong }]}>{`${text.name} · ${text.amount}`}</Text></View>;
            })}
            {open.length > 3 ? <View style={[styles.chip, { backgroundColor: palette.surfaceMuted }]}><Text style={[styles.chipText, { color: palette.textMuted }]}>{t('dailyGoals.moreOpen', { count: open.length - 3 })}</Text></View> : null}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const summaryStyles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { fontFamily: fonts.display, fontSize: 30 },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontFamily: fonts.bold },
  sub: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 32, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center' },
  chipText: { fontSize: 14, fontFamily: fonts.semibold },
});
