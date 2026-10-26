import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { filterSessions, figuresOf, groupByMonth, monthGrid, NO_FILTERS, shortcutsFor, type PeriodFilter, type PickFilters, type ShortcutId, type SortKey } from '../../domain/comparePicker';
import type { ExerciseHistorySession } from '../analytics/repository';
import { describeSets } from '../exercises/describeSets';
import { HistoryRow } from '../exercises/HistoryRow';
import { usePagedSections } from '../../shared/components/paging';
import { ActionButton, Chip, EmptyState, IconButton, Label, SegmentedControl, Sheet, tapFeedback, Text, TextField } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { fonts } from '../../shared/theme/typography';

type View_ = 'list' | 'chart' | 'calendar';
const PAGE = 20;
const BARS = 60;
const PERIODS: PeriodFilter[] = ['30d', '90d', '365d', 'all'];
const SORTS: SortKey[] = ['recent', 'volume', 'best', 'heaviest'];

/**
 * The full picker for "compare with": shortcuts and filters over the exercise's whole history, then the sessions as
 * a monthly list, a bar chart (one bar per session) or a calendar. A tap on any session chooses it.
 */
export function ComparePicker({ visible, onClose, sessions, metric, exerciseId, currentName, pickedId, onPick }: {
  visible: boolean;
  onClose: () => void;
  /** Every past session of the exercise, newest first. */
  sessions: readonly ExerciseHistorySession[];
  metric: string;
  exerciseId: string;
  /** Name of the workout being logged, for the "same workout" shortcut. */
  currentName: string;
  pickedId: string | null;
  onPick: (workoutId: string) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const [view, setView] = useState<View_>('list');
  const [filters, setFilters] = useState<PickFilters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [chartIndex, setChartIndex] = useState<number | null>(null);
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null);
  const [day, setDay] = useState<number | null>(null);

  const locale = i18n.language;
  const names = [...new Set(sessions.map((item) => item.workoutName))];
  const shown = filterSessions(sessions, filters, sort, metric, locale);
  const active = (filters.period !== 'all' ? 1 : 0) + (filters.name ? 1 : 0) + (filters.hardOnly ? 1 : 0) + (filters.withNote ? 1 : 0);
  const filtered = active > 0 || filters.query.trim() !== '';
  const clear = () => { setFilters(NO_FILTERS); setChartIndex(null); setDay(null); };
  const change = (patch: Partial<PickFilters>) => { setFilters((current) => ({ ...current, ...patch })); setChartIndex(null); setDay(null); };
  const choose = (id: string) => { tapFeedback(); onPick(id); onClose(); };
  const olderOf = (item: ExerciseHistorySession) => sessions[sessions.findIndex((other) => other.workoutId === item.workoutId) + 1];
  const row = (item: ExerciseHistorySession, first: boolean) => (
    <HistoryRow key={item.workoutId} session={item} older={olderOf(item)} exerciseId={exerciseId} metric={metric} locale={locale} first={first} selected={item.workoutId === pickedId} onSelect={() => choose(item.workoutId)} />
  );
  const box = [styles.box, { borderColor: palette.border, backgroundColor: palette.surface }];

  const shortcuts = shortcutsFor(sessions, metric, currentName);
  const shortcutLabel: Record<ShortcutId, string> = { last: t('compare.scLast'), sameWorkout: t('compare.scSame'), bestVolume: t('compare.scVolume'), bestSet: t('compare.scBest'), heaviest: t('compare.scHeaviest'), first: t('compare.scFirst') };
  const shortcutDetail = (id: ShortcutId, item: ExerciseHistorySession) => {
    const date = item.startedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    const figures = figuresOf(item, metric);
    return id === 'bestVolume' ? `${date} · ${Math.round(figures.total)}` : id === 'heaviest' ? `${date} · ${figures.heaviest} kg` : `${date} · ${item.workoutName}`;
  };

  const sections = usePagedSections(groupByMonth(shown, locale), PAGE, `${view}|${sort}|${JSON.stringify(filters)}`);
  const chronological = [...shown].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()).slice(-BARS);
  const barMax = Math.max(1, ...chronological.map((item) => figuresOf(item, metric).total));
  const barIndex = Math.min(chartIndex ?? chronological.length - 1, chronological.length - 1);
  const barSession = chronological[barIndex];

  const latest = shown[0]?.startedAt ?? new Date();
  const picked = sessions.find((item) => item.workoutId === pickedId)?.startedAt;
  const shownMonth = month ?? { year: (picked ?? latest).getFullYear(), month: (picked ?? latest).getMonth() };
  const moveMonth = (delta: number) => { const next = new Date(shownMonth.year, shownMonth.month + delta, 1); setMonth({ year: next.getFullYear(), month: next.getMonth() }); setDay(null); };
  const cells = monthGrid(shownMonth.year, shownMonth.month, shown);
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(locale, { weekday: 'narrow' }));
  const daySessions = day !== null ? cells.find((cell) => cell?.day === day)?.sessions ?? [] : [];
  const oldest = shown.length ? shown[shown.length - 1].startedAt : latest;
  const canPrev = shownMonth.year * 12 + shownMonth.month > oldest.getFullYear() * 12 + oldest.getMonth();
  const canNext = shownMonth.year * 12 + shownMonth.month < latest.getFullYear() * 12 + latest.getMonth();

  return (
    <Sheet visible={visible} onClose={onClose} title={t('compare.pickerTitle')}>
      <TextField label={t('compare.search')} value={filters.query} onChangeText={(query) => change({ query })} placeholder={t('compare.searchHint')} returnKeyType="search" autoCorrect={false} />

      <View style={styles.wrap}>
        {shortcuts.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${shortcutLabel[item.id]}: ${shortcutDetail(item.id, item.session)}`}
            onPress={() => choose(item.session.workoutId)}
            style={({ pressed }) => [styles.shortcut, { borderColor: ink, backgroundColor: item.session.workoutId === pickedId ? palette.accentSoft : palette.surface, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.shortcutTitle, { color: palette.text }]}>{shortcutLabel[item.id]}</Text>
            <Text numberOfLines={2} style={[styles.shortcutDetail, { color: palette.textMuted }]}>{shortcutDetail(item.id, item.session)}</Text>
          </Pressable>
        ))}
      </View>

      <Chip icon="options-outline" selected={showFilters || active > 0} label={active > 0 ? t('compare.filtersActive', { count: active }) : t('compare.filters')} onPress={() => setShowFilters((open) => !open)} />
      {showFilters ? (
        <View style={box}>
          <Label>{t('compare.period')}</Label>
          <View style={styles.wrap}>
            {PERIODS.map((value) => <Chip key={value} selected={filters.period === value} label={t(`compare.period_${value}`)} onPress={() => change({ period: value })} />)}
          </View>
          {names.length > 1 ? (
            <>
              <Label>{t('compare.workoutName')}</Label>
              <View style={styles.wrap}>
                <Chip selected={filters.name === null} label={t('compare.allNames')} onPress={() => change({ name: null })} />
                {names.slice(0, 12).map((name) => <Chip key={name} selected={filters.name === name} label={name} onPress={() => change({ name: filters.name === name ? null : name })} />)}
              </View>
            </>
          ) : null}
          <View style={styles.wrap}>
            <Chip icon="speedometer-outline" selected={filters.hardOnly} label={t('compare.hardOnly')} onPress={() => change({ hardOnly: !filters.hardOnly })} />
            <Chip icon="create-outline" selected={filters.withNote} label={t('compare.withNote')} onPress={() => change({ withNote: !filters.withNote })} />
          </View>
        </View>
      ) : null}

      <SegmentedControl<View_> value={view} onChange={(next) => { setView(next); setChartIndex(null); setDay(null); }} options={[
        { value: 'list', label: t('compare.viewList') },
        { value: 'chart', label: t('compare.viewChart') },
        { value: 'calendar', label: t('compare.viewCalendar') },
      ]} />

      <View style={styles.summary}>
        <Text style={[styles.summaryText, { color: palette.textMuted }]}>{t('compare.count', { count: shown.length, total: sessions.length })}</Text>
        {filtered ? <Chip label={t('compare.clearFilters')} onPress={clear} /> : null}
      </View>

      {shown.length === 0 ? (
        <EmptyState icon="search-outline" title={t('compare.emptyTitle')} body={t('compare.emptyBody')} action={filtered ? <ActionButton secondary label={t('compare.clearFilters')} onPress={clear} /> : undefined} />
      ) : view === 'list' ? (
        <>
          <View style={styles.wrap}>
            {SORTS.map((value) => <Chip key={value} selected={sort === value} label={t(`compare.sort_${value}`)} onPress={() => setSort(value)} />)}
          </View>
          {sort === 'recent' ? sections.shown.map((group) => (
            <View key={group.key} style={styles.group}>
              <View style={styles.monthHead}>
                <Text style={[styles.month, { color: palette.accentStrong }]}>{group.label}</Text>
                <Text style={[styles.monthCount, { color: palette.textMuted }]}>{group.total}</Text>
              </View>
              <View style={box}>{group.items.map((item, index) => row(item, index === 0))}</View>
            </View>
          )) : (
            <View style={box}>{shown.slice(0, sections.shown.reduce((sum, group) => sum + group.items.length, 0)).map((item, index) => row(item, index === 0))}</View>
          )}
          {sections.remaining > 0 ? <ActionButton variant="ghost" icon="chevron-down" label={t('common.showMoreCount', { count: sections.remaining })} onPress={sections.more} /> : null}
        </>
      ) : view === 'chart' ? (
        <>
          <Label>{t('compare.chartHint')}</Label>
          <View style={[styles.chart, { borderColor: ink, backgroundColor: palette.surface }]}>
            {chronological.map((item, index) => (
              <Pressable
                key={item.workoutId}
                accessibilityRole="button"
                accessibilityState={{ selected: index === barIndex }}
                accessibilityLabel={`${item.startedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}: ${describeSets(item.sets, metric)}`}
                hitSlop={{ top: 8, bottom: 8 }}
                onPress={() => setChartIndex(index)}
                style={styles.barSlot}
              >
                <View style={[styles.bar, { height: `${Math.max(6, (figuresOf(item, metric).total / barMax) * 100)}%`, backgroundColor: index === barIndex ? palette.accentStrong : item.workoutId === pickedId ? palette.success : palette.textMuted }]} />
              </Pressable>
            ))}
          </View>
          <View style={styles.chartNav}>
            <IconButton icon="chevron-back" label={t('compare.older')} tone="plain" disabled={barIndex <= 0} onPress={() => setChartIndex(barIndex - 1)} />
            <Text style={[styles.summaryText, { color: palette.textMuted }]}>{chronological[0]?.startedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} → {chronological[chronological.length - 1]?.startedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</Text>
            <IconButton icon="chevron-forward" label={t('compare.newer')} tone="plain" disabled={barIndex >= chronological.length - 1} onPress={() => setChartIndex(barIndex + 1)} />
          </View>
          {barSession ? <View style={box}>{row(barSession, true)}</View> : null}
        </>
      ) : (
        <>
          <View style={styles.monthNav}>
            <IconButton icon="chevron-back" label={t('compare.prevMonth')} tone="plain" disabled={!canPrev} onPress={() => moveMonth(-1)} />
            <Text style={[styles.monthTitle, { color: palette.text }]}>{new Date(shownMonth.year, shownMonth.month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</Text>
            <IconButton icon="chevron-forward" label={t('compare.nextMonth')} tone="plain" disabled={!canNext} onPress={() => moveMonth(1)} />
          </View>
          <View style={styles.grid}>
            {weekdays.map((name, index) => <Text key={`w${index}`} style={[styles.weekday, { color: palette.textMuted }]}>{name.toUpperCase()}</Text>)}
            {cells.map((cell, index) => {
              if (!cell) return <View key={`b${index}`} style={styles.cell} />;
              const has = cell.sessions.length > 0;
              const selected = day === cell.day;
              const isPicked = cell.sessions.some((item) => item.workoutId === pickedId);
              return (
                <Pressable
                  key={cell.day}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !has }}
                  accessibilityLabel={`${cell.day}${has ? `, ${t('compare.daySessions', { count: cell.sessions.length })}` : ''}`}
                  disabled={!has}
                  onPress={() => { tapFeedback(); setDay(cell.day); }}
                  style={[styles.cell, has && { borderColor: ink, borderWidth: instrument.line, backgroundColor: selected ? palette.accentStrong : palette.surface }]}
                >
                  <Text style={[styles.cellText, { color: selected ? palette.accentText : has ? palette.text : palette.textMuted }]}>{cell.day}</Text>
                  {has ? <View style={[styles.dot, { backgroundColor: selected ? palette.accentText : isPicked ? palette.success : palette.accentStrong }]} /> : null}
                </Pressable>
              );
            })}
          </View>
          {day !== null ? <View style={box}>{daySessions.map((item, index) => row(item, index === 0))}</View> : <Label>{t('compare.calendarHint')}</Label>}
        </>
      )}
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  box: { gap: spacing.sm, borderRadius: radii.control, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  shortcut: { flexGrow: 1, flexBasis: 140, minHeight: MIN_TOUCH_TARGET, borderWidth: instrument.line, borderRadius: radii.control, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  shortcutTitle: { fontFamily: fonts.display, fontSize: 15, lineHeight: 20, textTransform: 'uppercase' },
  shortcutDetail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  summaryText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  group: { gap: spacing.xs },
  monthHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  month: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1 },
  monthCount: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 140, padding: spacing.sm, borderWidth: instrument.line, borderRadius: radii.control },
  barSlot: { flex: 1, minWidth: 4, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 1 },
  chartNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  monthTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, textTransform: 'uppercase', flexShrink: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, paddingBottom: spacing.xs },
  cell: { width: '14.2857%', minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, gap: 2 },
  cellText: { fontFamily: fonts.monoSemibold, fontSize: 14, lineHeight: 18 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
