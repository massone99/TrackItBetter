import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { DailyGoal, DaySet, GoalPeriod } from '../../domain/dailyGoals';
import { periodResults, periodStarts, streaks, type PeriodResult } from '../../domain/goalHistory';
import { ActionButton, Body, Card, EmptyState, Icon, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, Text, tapFeedback } from '../../shared/components/ui';
import { ShowMore, usePaged } from '../../shared/components/paging';
import { MIN_TOUCH_TARGET } from '../../shared/theme/tokens';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { fonts } from '../../shared/theme/typography';
import { GoalSegments, useGoalText } from './DailyGoalViews';
import { listSetsSince, goalsOf } from './repository';

/** Half a year of days and weeks: what is loaded, so moving between months never waits. */
const WEEKS = 26;

type Data = { goals: Record<GoalPeriod, DailyGoal[]>; sets: DaySet[] };

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** How the days and weeks went against the goals: a month calendar for days, a list for weeks. */
export function HistoryPage({ initialPeriod }: { initialPeriod: GoalPeriod }) {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const goalText = useGoalText();
  const [period, setPeriod] = useState<GoalPeriod>(initialPeriod);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  const load = useCallback(() => {
    const first = periodStarts(new Date(), WEEKS, 'week')[0];
    void Promise.all([goalsOf('day').list(), goalsOf('week').list(), listSetsSince(first)]).then(
      ([day, week, sets]) => { setData({ goals: { day, week }, sets }); setFailed(false); },
      () => setFailed(true),
    );
  }, []);
  useFocusEffect(load);

  const now = new Date();
  const goals = data?.goals[period] ?? [];
  const starts = periodStarts(now, period === 'week' ? WEEKS : WEEKS * 7, period);
  const results = data ? periodResults(goals, data.sets, starts, period, now) : [];
  const run = streaks(results);
  const byDay = new Map(results.map((result) => [dayKey(result.start), result]));
  const weeksNewestFirst = [...results].reverse();
  const weekPage = usePaged(weeksNewestFirst, 8, period);
  const unit = period === 'week' ? 'weeks' : 'days';
  const monthDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const blanks = (month.getDay() + 6) % 7;
  const cells = [...Array.from({ length: blanks }, () => null), ...Array.from({ length: monthDays }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
  const canPrev = starts.length > 0 && month.getTime() > new Date(starts[0].getFullYear(), starts[0].getMonth(), 1).getTime();
  const canNext = month.getTime() < new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthLabel = month.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
  const weekdays = t('goals.weekdayInitials').split(' ');
  const monthDaysReached = cells.filter((cell): cell is Date => cell !== null).filter((cell) => byDay.get(dayKey(cell))?.status === 'all').length;

  const rangeLabel = (start: Date) => {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const format = { day: 'numeric', month: 'short' } as const;
    return `${start.toLocaleDateString(i18n.language, format)} – ${end.toLocaleDateString(i18n.language, format)}`;
  };
  const dayLabel = (date: Date) => date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });

  const detail = (result: PeriodResult) => (
    <ListGroup>
      {result.progress.map((item) => {
        const text = goalText(item);
        return (
          <ListRow
            key={item.goal.id}
            icon={item.reached ? 'checkmark' : 'ellipse-outline'}
            tint={item.reached ? palette.success : palette.textMuted}
            title={text.name}
            subtitle={`${text.amount}${text.over ? ` · ${text.over}` : ''}`}
          />
        );
      })}
    </ListGroup>
  );

  const selectedResult = selected ? byDay.get(dayKey(selected)) : undefined;

  return (
    <Screen>
      <PageHeading title={t('dailyGoals.historyTitle')} subtitle={t('dailyGoals.historyNote')} />
      <SegmentedControl<GoalPeriod>
        value={period}
        onChange={(next) => { setPeriod(next); setSelected(null); setOpenWeek(null); }}
        options={[{ value: 'day', label: t('dailyGoals.periodDay') }, { value: 'week', label: t('dailyGoals.periodWeek') }]}
      />
      {failed ? (
        <EmptyState icon="alert-circle-outline" title={t('common.loadError')} body={t('common.loadErrorBody')} action={<ActionButton icon="refresh" label={t('common.tryAgain')} onPress={load} />} />
      ) : !data ? (
        <ActivityIndicator color={palette.accent} />
      ) : goals.length === 0 ? (
        <EmptyState icon="flag-outline" title={t('dailyGoals.historyEmptyTitle')} body={t('dailyGoals.historyEmptyBody')} action={<ActionButton icon="add" label={t('dailyGoals.add')} onPress={() => router.replace(period === 'week' ? '/weekly-goals' : '/daily-goals')} />} />
      ) : (
        <>
          <View style={styles.tiles}>
            <Card style={styles.tile}>
              <View style={styles.tileValue}>
                <Icon name="flame" size={22} color={run.current > 0 ? palette.record : palette.textMuted} />
                <Text style={[styles.tileNumber, { color: palette.text }]}>{run.current}</Text>
              </View>
              <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{t('dailyGoals.streakNow')}</Text>
              <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{t(`dailyGoals.unit_${unit}`, { count: run.current })}</Text>
            </Card>
            <Card style={styles.tile}>
              <View style={styles.tileValue}>
                <Icon name="trophy" size={22} color={run.best > 0 ? palette.record : palette.textMuted} />
                <Text style={[styles.tileNumber, { color: palette.text }]}>{run.best}</Text>
              </View>
              <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{t('dailyGoals.streakBest')}</Text>
              <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{t(`dailyGoals.unit_${unit}`, { count: run.best })}</Text>
            </Card>
          </View>

          {period === 'day' ? (
            <>
              <View style={styles.monthBar}>
                <IconButton icon="chevron-back" label={t('dailyGoals.monthPrev')} disabled={!canPrev} onPress={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setSelected(null); }} />
                <View style={styles.monthTitle}>
                  <Text style={[styles.monthText, { color: palette.text }]}>{monthLabel}</Text>
                  <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{t('dailyGoals.monthReached', { count: monthDaysReached })}</Text>
                </View>
                <IconButton icon="chevron-forward" label={t('dailyGoals.monthNext')} disabled={!canNext} onPress={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setSelected(null); }} />
              </View>
              <View style={styles.grid}>
                {weekdays.map((letter, index) => <Text key={`h${index}`} style={[styles.weekday, { color: palette.textMuted }]}>{letter}</Text>)}
                {cells.map((cell, index) => {
                  if (!cell) return <View key={`b${index}`} style={styles.cell} />;
                  const result = byDay.get(dayKey(cell));
                  const status = result?.future ? 'empty' : result?.status ?? 'empty';
                  const isSelected = selected !== null && dayKey(selected) === dayKey(cell);
                  const filled = status === 'all';
                  const partial = status === 'partial';
                  const label = `${dayLabel(cell)}: ${result ? t('dailyGoals.reachedOf', { done: result.reached, total: result.total }) : t('dailyGoals.noData')}`;
                  return (
                    <View key={dayKey(cell)} style={styles.cell}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: isSelected }}
                        disabled={!result || result.future}
                        hitSlop={2}
                        onPress={() => { tapFeedback(); setSelected(isSelected ? null : cell); }}
                        style={[styles.day, {
                          backgroundColor: filled ? palette.success : partial ? palette.accentSoft : 'transparent',
                          borderColor: isSelected ? palette.accentStrong : result?.current ? palette.text : 'transparent',
                          opacity: !result || result.future ? 0.35 : 1,
                        }]}
                      >
                        <Text style={[styles.dayNumber, { color: filled ? palette.successText : partial ? palette.accentStrong : palette.text }]}>{cell.getDate()}</Text>
                        {filled ? <Icon name="checkmark" size={12} color={palette.successText} /> : partial && result ? <Text style={[styles.dayCount, { color: palette.accentStrong }]}>{`${result.reached}/${result.total}`}</Text> : null}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <View style={styles.legend}>
                <LegendDot color={palette.success} label={t('dailyGoals.legendAll')} />
                <LegendDot color={palette.accentSoft} label={t('dailyGoals.legendSome')} />
              </View>
              {selectedResult && selected ? (
                <>
                  <SectionTitle title={dayLabel(selected)} />
                  <GoalSegments progress={selectedResult.progress} />
                  {detail(selectedResult)}
                </>
              ) : (
                <Body>{t('dailyGoals.pickDay')}</Body>
              )}
            </>
          ) : (
            <>
              <SectionTitle title={t('dailyGoals.weeksTitle')} />
              {weekPage.shown.map((result, index) => {
                const expanded = openWeek === index;
                const tone = result.status === 'all' ? palette.success : result.status === 'partial' ? palette.accentStrong : palette.textMuted;
                return (
                  <View key={result.start.getTime()} style={styles.weekBlock}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`${rangeLabel(result.start)}: ${t('dailyGoals.reachedOf', { done: result.reached, total: result.total })}`}
                      onPress={() => { tapFeedback(); setOpenWeek(expanded ? null : index); }}
                      style={({ pressed }) => [styles.weekRow, { backgroundColor: pressed ? palette.surfaceMuted : palette.surface, borderColor: result.current ? palette.accentStrong : palette.border }]}
                    >
                      <View style={styles.weekHead}>
                        {result.status === 'all' ? <Icon name="checkmark-circle" size={22} color={palette.success} /> : null}
                        <View style={styles.weekCopy}>
                          <Text style={[styles.weekTitle, { color: palette.text }]}>{rangeLabel(result.start)}</Text>
                          {result.current ? <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{t('dailyGoals.thisWeek')}</Text> : null}
                        </View>
                        <Text style={[styles.weekCount, { color: tone }]}>{`${result.reached}/${result.total}`}</Text>
                        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
                      </View>
                      <GoalSegments progress={result.progress} />
                    </Pressable>
                    {expanded ? detail(result) : null}
                  </View>
                );
              })}
              <ShowMore remaining={weekPage.remaining} onPress={weekPage.more} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color, borderColor: palette.border }]} />
      <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{label}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, gap: 2 },
  tileValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileNumber: { fontFamily: fonts.display, fontSize: 34 },
  tileLabel: { fontSize: 13 },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthTitle: { flex: 1, alignItems: 'center' },
  monthText: { fontSize: 18, fontFamily: fonts.bold, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontFamily: fonts.semibold, paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, padding: 2, alignItems: 'center' },
  day: { width: '100%', minHeight: MIN_TOUCH_TARGET, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayNumber: { fontSize: 15, fontFamily: fonts.semibold },
  dayCount: { fontSize: 12, fontFamily: fonts.semibold },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  weekBlock: { gap: 8 },
  weekRow: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10, minHeight: MIN_TOUCH_TARGET },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekCopy: { flex: 1 },
  weekTitle: { fontSize: 16, fontFamily: fonts.semibold },
  weekCount: { fontFamily: fonts.display, fontSize: 24 },
});
