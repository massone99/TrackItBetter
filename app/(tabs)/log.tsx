import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/shared/components/Text';
import { PastWorkoutFlow } from '../../src/features/session/PastWorkoutFlow';
import { getActiveWorkout, listWorkoutsBetween, listWorkoutsPage, listWorkoutStarts } from '../../src/features/session/repository';
import type { WorkoutHistoryItem } from '../../src/features/session/repository';
import { WorkoutLogRow } from '../../src/features/session/WorkoutLogRow';
import { ActionButton, Body, Card, EmptyState, Heading, IconButton, Label, PageHeading, Screen } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { fonts } from '../../src/shared/theme/typography';
import { dateKey } from '../../src/shared/utils/date';

/** Workouts read from the database per page, so years of training load as fast as a week. */
const PAGE_SIZE = 30;

export default function LogScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The calendar shows one week until opened to the whole month; `anchor` is a day in the shown range.
  const [anchor, setAnchor] = useState(() => new Date());
  const [monthOpen, setMonthOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayWorkouts, setDayWorkouts] = useState<WorkoutHistoryItem[] | null>(null);
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(new Map());
  const [pastOpen, setPastOpen] = useState(false);
  const [todayKey] = useState(() => dateKey(new Date()));
  // Date keys are YYYY-MM-DD, so they compare as strings.
  const selectedIsFuture = selectedDate !== null && selectedDate > todayKey;

  const rangeStart = dateKey(monthOpen ? monthGrid(anchor)[0] : weekOf(anchor)[0]);
  const rangeLength = monthOpen ? 42 : 7;
  // How many workouts are loaded, so a reload on focus keeps the pages already opened.
  const loaded = useRef(0);

  /** Reloads what is on screen: the loaded workouts, the calendar's dots and the picked day. */
  const refresh = useCallback(async (start: string, length: number, day: string | null) => {
    const size = Math.max(PAGE_SIZE, loaded.current);
    const [page, active, starts, onDay] = await Promise.all([
      listWorkoutsPage(size),
      getActiveWorkout(),
      listWorkoutStarts(dayStart(start), dayStart(start, length)),
      day ? listWorkoutsBetween(dayStart(day), dayStart(day, 1)) : Promise.resolve(null),
    ]);
    loaded.current = page.length;
    setWorkouts(page);
    setHasMore(page.length === size);
    setActiveWorkoutId(active?.id ?? null);
    const next = new Map<string, number>();
    for (const started of starts) next.set(dateKey(started), (next.get(dateKey(started)) ?? 0) + 1);
    setCounts(next);
    setDayWorkouts(onDay);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void refresh(rangeStart, rangeLength, selectedDate); }, [refresh, rangeStart, rangeLength, selectedDate]));

  const loadMore = async () => {
    const last = workouts[workouts.length - 1];
    if (!last) return;
    const page = await listWorkoutsPage(PAGE_SIZE, { startedAt: last.startedAt, id: last.id });
    loaded.current += page.length;
    setWorkouts((current) => [...current, ...page]);
    setHasMore(page.length === PAGE_SIZE);
  };

  const calendarDays = monthOpen ? monthGrid(anchor) : weekOf(anchor);
  const locale = i18n.language.startsWith('it') ? 'it-IT' : 'en-US';
  const monthLabel = anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekdayLabels = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const step = (direction: 1 | -1) => setAnchor((current) => monthOpen
    ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
    : new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7 * direction));
  const shown = selectedDate ? dayWorkouts ?? [] : workouts;
  // Month headers over the rows, like the exercise history.
  const months = groupByMonth(shown, locale);

  return (
    <Screen>
      <PageHeading title={t('log.title')} subtitle={t('log.subtitle')} />
      <View style={styles.actions}>
        <ActionButton icon={activeWorkoutId ? 'play' : 'add'} label={t(activeWorkoutId ? 'common.resumeWorkout' : 'common.startWorkout')} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: activeWorkoutId ?? 'new' } })} />
        <ActionButton
          icon="time-outline"
          label={selectedDate && !selectedIsFuture ? t('log.addPastOnDate', { date: new Date(`${selectedDate}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) }) : t('log.addPast')}
          secondary
          onPress={() => setPastOpen(true)}
        />
      </View>
      {workouts.length === 0 && !loading ? (
        <EmptyState icon="calendar-clear-outline" title={t('log.empty')} body={t('log.emptyBody')} />
      ) : workouts.length > 0 ? (
        <>
          <Card style={styles.calendar}>
            <View style={styles.calendarHeader}>
              <IconButton icon="chevron-back" label={monthOpen ? t('log.previousMonth') : t('log.previousWeek')} onPress={() => step(-1)} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: monthOpen }}
                accessibilityLabel={`${monthLabel}, ${monthOpen ? t('log.hideMonth') : t('log.showMonth')}`}
                onPress={() => setMonthOpen((open) => !open)}
                style={styles.monthToggle}
              >
                <Heading style={styles.monthTitle}>{monthLabel}</Heading>
                <Text style={[styles.monthHint, { color: palette.accentStrong }]}>{monthOpen ? t('log.hideMonth') : t('log.showMonth')}</Text>
              </Pressable>
              <IconButton icon="chevron-forward" label={monthOpen ? t('log.nextMonth') : t('log.nextWeek')} onPress={() => step(1)} />
            </View>
            <View style={styles.calendarGrid}>
              {weekdayLabels.map((day) => <Text key={day} style={[styles.weekday, { color: palette.textMuted }]}>{t(`log.weekdays.${day}`)}</Text>)}
              {calendarDays.map((date) => {
                const key = dateKey(date);
                const count = counts.get(key) ?? 0;
                const selected = selectedDate === key;
                const inMonth = !monthOpen || date.getMonth() === anchor.getMonth();
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={t('log.calendarDayLabel', { date: date.toLocaleDateString(locale), count })}
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedDate(selected ? null : key)}
                    style={[styles.day, selected && { backgroundColor: palette.accent }, key === todayKey && !selected && { borderWidth: 1, borderColor: palette.border }]}
                  >
                    <Text style={[styles.dayNumber, { color: selected ? palette.accentText : inMonth ? palette.text : palette.textMuted }]}>{date.getDate()}</Text>
                    <View style={[styles.dayDot, { backgroundColor: count > 0 ? (selected ? palette.accentText : palette.accentStrong) : 'transparent' }]} />
                  </Pressable>
                );
              })}
            </View>
            {selectedDate ? (
              <View style={styles.calendarFooter}>
                <Body>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</Body>
                <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setSelectedDate(null)}><Text style={[styles.clear, { color: palette.accentStrong }]}>{t('log.clearDate')}</Text></Pressable>
              </View>
            ) : null}
          </Card>
          {selectedDate && dayWorkouts && dayWorkouts.length === 0 ? <Body style={styles.center}>{t('log.noWorkoutsOnDate')}</Body> : null}
          {months.map((month) => (
            <View key={month.label} style={styles.month}>
              <Label style={styles.monthLabel}>{month.label}</Label>
              <View style={[styles.rows, { borderTopColor: palette.border }]}>
                {month.items.map((workout, index) => <WorkoutLogRow key={workout.id} workout={workout} locale={locale} first={index === 0} />)}
              </View>
            </View>
          ))}
          {selectedDate || !hasMore ? null : <ActionButton variant="ghost" icon="chevron-down" label={t('common.showMore')} onPress={() => void loadMore()} />}
        </>
      ) : null}
      <PastWorkoutFlow visible={pastOpen} dateKey={selectedIsFuture ? null : selectedDate} onClose={() => setPastOpen(false)} />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  actions: { gap: 8 },
  center: { textAlign: 'center' },
  calendar: { gap: 8, paddingVertical: 12 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthToggle: { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  monthTitle: { textAlign: 'center', textTransform: 'capitalize', fontSize: 18 },
  monthHint: { fontFamily: fonts.semibold, fontSize: 12 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', minHeight: 24, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, fontFamily: fonts.semibold },
  day: { width: '14.2857%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayNumber: { fontFamily: fonts.medium, fontSize: 15 },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  calendarFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, paddingHorizontal: 4 },
  clear: { fontFamily: fonts.semibold, fontSize: 14 },
  month: { gap: 6 },
  monthLabel: { textTransform: 'capitalize', paddingHorizontal: 4 },
  rows: { borderTopWidth: StyleSheet.hairlineWidth },
});

/** Consecutive workouts of the same month under one label, newest month first. */
function groupByMonth(items: readonly WorkoutHistoryItem[], locale: string): { label: string; items: WorkoutHistoryItem[] }[] {
  const groups: { label: string; items: WorkoutHistoryItem[] }[] = [];
  for (const workout of items) {
    const label = workout.startedAt.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(workout);
    else groups.push({ label, items: [workout] });
  }
  return groups;
}


/** Local midnight of a YYYY-MM-DD day, moved by `days`. */
function dayStart(key: string, days = 0): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day + days);
}

/** Monday to Sunday of the week holding `date`. */
function weekOf(date: Date): Date[] {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
}

/** The six weeks shown for the month holding `date`, Monday first. */
function monthGrid(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index - offset + 1));
}
