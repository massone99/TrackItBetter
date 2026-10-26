import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { DailyGoalProgress, GoalPeriod } from '../../domain/dailyGoals';
import { Card, Icon, type IconName, SectionTitle, SegmentedControl, Stepper, Text, tapFeedback } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { fonts } from '../../shared/theme/typography';
import { MIN_TOUCH_TARGET, radii } from '../../shared/theme/tokens';
import { targetMax } from '../../domain/dailyGoals';
import { useGoalT } from './period';
import { goalAmount, goalKeyLabel } from './labels';

export const GOAL_STEPS = { minutes: 15, reps: 5 } as const;

/** "0:35 / 1:00" or "18 / 30 reps", what is left and how far past the goal. */
export function useGoalText() {
  const { t } = useTranslation();
  return (progress: DailyGoalProgress) => {
    const { goal, done, remaining } = progress;
    const unit = goal.measure === 'reps' ? ` ${t('dailyGoals.repsUnit')}` : '';
    return {
      name: goalKeyLabel(goal, t),
      kind: `${t(`dailyGoals.scope.${goal.scope}`)} · ${t(`dailyGoals.measure.${goal.measure}`).toLocaleLowerCase()}`,
      amount: `${goalAmount(goal.measure, done)} / ${goalAmount(goal.measure, goal.target)}${unit}`,
      remaining: t('dailyGoals.remaining', { amount: `${goalAmount(goal.measure, remaining)}${unit}` }),
      over: done > goal.target ? `+${goalAmount(goal.measure, done - goal.target)}` : null,
    };
  };
}

/** One segment per goal: filled as far as it got, green once reached. */
export function GoalSegments({ progress }: { progress: readonly DailyGoalProgress[] }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const reached = progress.filter((item) => item.reached).length;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('dailyGoals.reachedOf', { done: reached, total: progress.length })} style={styles.segments}>
      {progress.map((item) => (
        <View key={item.goal.id} style={[styles.segment, { backgroundColor: item.reached ? palette.success : palette.surfaceMuted }]}>
          {item.reached ? null : <View style={[styles.segmentFill, { backgroundColor: palette.accentStrong, width: `${Math.min(100, (item.done / item.goal.target) * 100)}%` }]} />}
        </View>
      ))}
    </View>
  );
}

function RowAction({ icon, label, onPress, disabled, tone = 'plain' }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; tone?: 'plain' | 'accent' | 'danger' }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const color = tone === 'accent' ? palette.accentStrong : tone === 'danger' ? palette.warning : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.action, {
        backgroundColor: tone === 'accent' ? palette.accentSoft : tone === 'danger' ? palette.surface : palette.surfaceMuted,
        borderColor: tone === 'danger' ? palette.warning : 'transparent',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      }]}
    >
      <Icon name={icon} size={18} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A goal in the list. A tap opens it in place: the daily total with − and +, and every action on it
 * as a labelled button, so nothing hides behind a gesture or a menu.
 */
export function GoalRow({ period = 'day', progress, expanded, divider, canMoveUp, canMoveDown, child = false, onToggle, onTarget, onDetails, onEdit, onDuplicate, onMove, onDelete }: {
  period?: GoalPeriod;
  progress: DailyGoalProgress;
  expanded: boolean;
  /** A line under the row (every row but the last one shown). */
  divider: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Sits under its movement tag: indented, with a connector, named by its mobility type only. */
  child?: boolean;
  onToggle: () => void;
  onTarget: (value: number) => void;
  onDetails: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const tg = useGoalT(period);
  const text = useGoalText()(progress);
  const { goal, reached } = progress;
  const name = child && goal.mobilityMode ? t(`customExercise.mobilityMode.${goal.mobilityMode}`) : text.name;
  const kind = child && goal.mobilityMode ? `${t('dailyGoals.mobilityKind', { type: name.toLocaleLowerCase() })} · ${t(`dailyGoals.measure.${goal.measure}`).toLocaleLowerCase()}` : text.kind;
  return (
    <View style={[divider ? styles.divider : null, child ? styles.child : null, { borderColor: palette.border, backgroundColor: expanded ? palette.background : 'transparent' }]}>
      {child ? <View pointerEvents="none" style={[styles.connector, { borderColor: palette.border }]} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${kind}, ${text.amount}, ${reached ? t('dailyGoals.reachedShort') : text.remaining}`}
        accessibilityState={{ expanded }}
        onPress={() => { tapFeedback(); onToggle(); }}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? palette.surfaceMuted : 'transparent' }]}
      >
        <View style={styles.rowHead}>
          {reached ? <Icon name="checkmark-circle" size={24} color={palette.success} /> : null}
          <View style={styles.rowCopy}>
            <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
            <Text style={[styles.kind, { color: palette.textMuted }]}>{kind}</Text>
          </View>
          <View style={styles.rowAmount}>
            <Text style={[styles.amount, { color: reached ? palette.success : palette.text }]}>{text.amount}</Text>
            <Text style={[styles.status, { color: reached ? palette.success : palette.accentStrong }]}>{reached ? text.over ?? t('dailyGoals.reachedShort') : text.remaining}</Text>
          </View>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
        </View>
        {reached ? null : (
          <View style={[styles.track, { backgroundColor: palette.surfaceMuted }]}>
            <View style={[styles.fill, { backgroundColor: palette.accentStrong, width: `${Math.min(100, (progress.done / goal.target) * 100)}%` }]} />
          </View>
        )}
      </Pressable>
      {expanded ? (
        <View style={styles.panel}>
          <Stepper
            label={tg('perDay')}
            layout="row"
            value={goal.target}
            display={goalAmount(goal.measure, goal.target)}
            step={GOAL_STEPS[goal.measure]}
            min={GOAL_STEPS[goal.measure]}
            max={targetMax(period, goal.measure)}
            onChange={(value) => onTarget(Math.max(1, Math.round(value)))}
          />
          <View style={styles.actions}>
            <RowAction icon="list-outline" label={t('dailyGoals.details')} tone="accent" onPress={onDetails} />
            <RowAction icon="create-outline" label={t('dailyGoals.edit')} onPress={onEdit} />
            <RowAction icon="copy-outline" label={t('dailyGoals.duplicate')} onPress={onDuplicate} />
            <RowAction icon="arrow-up" label={t('dailyGoals.moveUp')} disabled={!canMoveUp} onPress={() => onMove(-1)} />
            <RowAction icon="arrow-down" label={t('dailyGoals.moveDown')} disabled={!canMoveDown} onPress={() => onMove(1)} />
            <RowAction icon="trash-outline" label={t('dailyGoals.delete')} tone="danger" onPress={onDelete} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The heading of a movement tag whose total goal does not exist: its active and passive goals sit under it. */
export function GoalGroupHeader({ name, divider }: { name: string; divider: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View accessible accessibilityRole="header" style={[styles.groupHeader, divider ? styles.divider : null, { borderColor: palette.border }]}>
      <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
    </View>
  );
}

/** Today's goals on the Today screen: how many are reached and what is still open. */
export function DailyGoalsSummary({ period = 'day', progress, onPress }: { period?: GoalPeriod; progress: readonly DailyGoalProgress[]; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const goalText = useGoalText();
  const reached = progress.filter((item) => item.reached).length;
  const open = progress.filter((item) => !item.reached);
  const tg = useGoalT(period);
  const title = tg('title');
  const count = t('dailyGoals.reachedOf', { done: reached, total: progress.length });
  const missing = open.map((item) => { const text = goalText(item); return `${text.name} ${text.amount}`; }).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${count}`} onPress={() => { tapFeedback(); onPress(); }}>
      <Card style={styles.summary}>
        <View style={styles.summaryHead}>
          <Text style={[styles.count, { color: reached === progress.length ? palette.success : palette.accentStrong }]}>{`${reached}/${progress.length}`}</Text>
          <Text style={[styles.summaryTitle, { color: palette.text }]}>{title}</Text>
          <Icon name="chevron-forward" size={18} color={palette.textMuted} />
        </View>
        <GoalSegments progress={progress} />
        <Text style={[styles.kind, { color: palette.textMuted }]}>
          {open.length === 0 ? t('dailyGoals.allReached') : t('dailyGoals.missing', { list: missing })}
        </Text>
      </Card>
    </Pressable>
  );
}

/** The goals of the Today screen: one area, a card for each period that has goals, each opening its own page. */
export function GoalsArea({ daily, weekly }: { daily: readonly DailyGoalProgress[]; weekly: readonly DailyGoalProgress[] }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  if (daily.length === 0 && weekly.length === 0) return null;
  return (
    <View style={styles.area}>
      <SectionTitle title={t('dailyGoals.areaTitle')} />
      {daily.length > 0 ? <DailyGoalsSummary progress={daily} onPress={() => router.push('/daily-goals')} /> : null}
      {weekly.length > 0 ? <DailyGoalsSummary period="week" progress={weekly} onPress={() => router.push('/weekly-goals')} /> : null}
    </View>
  );
}

/** Switches between the daily and the weekly goals pages: two pages, one area. */
export function GoalsPeriodSwitch({ period }: { period: GoalPeriod }) {
  const { t } = useTranslation();
  return (
    <SegmentedControl<GoalPeriod>
      value={period}
      onChange={(next) => { if (next !== period) router.replace(next === 'week' ? '/weekly-goals' : '/daily-goals'); }}
      options={[{ value: 'day', label: t('dailyGoals.periodDay') }, { value: 'week', label: t('dailyGoals.periodWeek') }]}
    />
  );
}

const baseStyles = StyleSheet.create({
  area: { gap: 8 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  segmentFill: { height: '100%' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  child: { paddingLeft: 24 },
  connector: { position: 'absolute', left: 14, top: 0, height: 28, width: 10, borderLeftWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: 8 },
  groupHeader: { minHeight: 44, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, justifyContent: 'center' },
  row: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, gap: 8, justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontFamily: fonts.semibold },
  kind: { fontSize: 13 },
  rowAmount: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '45%' },
  amount: { fontSize: 18, fontFamily: fonts.display, textAlign: 'right' },
  status: { fontSize: 13, fontFamily: fonts.semibold, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%' },
  panel: { paddingHorizontal: 14, paddingBottom: 12, gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  action: { flexGrow: 1, flexBasis: '30%', minHeight: MIN_TOUCH_TARGET, borderRadius: radii.control, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { fontSize: 14, fontFamily: fonts.semibold },
  summary: { gap: 8 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { fontFamily: fonts.display, fontSize: 24 },
  summaryTitle: { flex: 1, fontSize: 16, fontFamily: fonts.bold },
});
