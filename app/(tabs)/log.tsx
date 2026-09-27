import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/shared/components/Text';
import { getActiveWorkout, listRecentWorkouts } from '../../src/features/session/repository';
import type { WorkoutHistoryItem } from '../../src/features/session/repository';
import { ActionButton, Body, Card, EmptyState, Heading, IconButton, PageHeading, Screen } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

export default function LogScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [history, active] = await Promise.all([listRecentWorkouts(), getActiveWorkout()]);
    setWorkouts(history);
    setActiveWorkoutId(active?.id ?? null);
    if (history[0]) setCalendarMonth(new Date(history[0].startedAt.getFullYear(), history[0].startedAt.getMonth(), 1));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const workoutCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const workout of workouts) {
      const key = localDateKey(workout.startedAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [workouts]);
  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first.getFullYear(), first.getMonth(), index - offset + 1);
      return { date, inMonth: date.getMonth() === first.getMonth(), key: localDateKey(date) };
    });
  }, [calendarMonth]);
  const visibleWorkouts = selectedDate
    ? workouts.filter((workout) => localDateKey(workout.startedAt) === selectedDate)
    : workouts;
  const locale = i18n.language.startsWith('it') ? 'it-IT' : 'en-US';
  const monthLabel = calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekdayLabels = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  return (
    <Screen>
      <PageHeading title={t('log.title')} subtitle={t('log.subtitle')} />
      <ActionButton icon={activeWorkoutId ? 'play' : 'add'} label={t(activeWorkoutId ? 'common.resumeWorkout' : 'common.startWorkout')} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: activeWorkoutId ?? 'new' } })} />
      {workouts.length === 0 && !loading ? (
        <EmptyState icon="calendar-clear-outline" title={t('log.empty')} body={t('log.emptyBody')} />
      ) : workouts.length > 0 ? (
        <>
          <Card style={styles.calendar}>
            <View style={styles.calendarHeader}>
              <IconButton icon="chevron-back" label={t('log.previousMonth')} onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
              <Heading style={styles.monthTitle}>{monthLabel}</Heading>
              <IconButton icon="chevron-forward" label={t('log.nextMonth')} onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
            </View>
            <View style={styles.calendarGrid}>
              {weekdayLabels.map((day) => <Text key={day} style={[styles.weekday, { color: palette.textMuted }]}>{t(`log.weekdays.${day}`)}</Text>)}
              {calendarDays.map(({ date, inMonth, key }) => {
                const count = workoutCounts.get(key) ?? 0;
                const selected = selectedDate === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={t('log.calendarDayLabel', { date: date.toLocaleDateString(locale), count })}
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedDate(selected ? null : key)}
                    style={[styles.day, selected && { backgroundColor: palette.accent }, !inMonth && styles.outsideMonth]}
                  >
                    <Text style={{ color: inMonth ? palette.text : palette.textMuted, fontWeight: selected ? '800' : '500' }}>{date.getDate()}</Text>
                    {count > 0 ? <View style={[styles.dayDot, { backgroundColor: selected ? palette.accentStrong : palette.accentStrong }]} /> : <View style={styles.dayDotPlaceholder} />}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.calendarFooter}>
              <Body>{selectedDate ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(locale) : t('log.allDates')}</Body>
              {selectedDate ? <Pressable accessibilityRole="button" onPress={() => setSelectedDate(null)}><Text style={{ color: palette.accentStrong, fontWeight: '700' }}>{t('log.clearDate')}</Text></Pressable> : null}
            </View>
          </Card>
          {visibleWorkouts.length === 0 ? (
            <Card style={styles.emptyDate}>
              <Body style={styles.center}>{t('log.noWorkoutsOnDate')}</Body>
            </Card>
          ) : visibleWorkouts.map((workout) => {
        const duration = Math.max(0, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));
        return (
          <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`Edit ${workout.name}`} onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: workout.id } })}>
          <Card style={styles.workout}>
            <View style={styles.workoutTop}>
              <Heading>{workout.name}</Heading>
              <Text style={{ color: palette.accentStrong, fontWeight: '800' }}>{t('log.setCount', { count: workout.setCount })}</Text>
            </View>
            <Body>{workout.startedAt.toLocaleDateString()} · {duration} min</Body>
          </Card>
          </Pressable>
        );
          })}
        </>
      ) : null}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  empty: { minHeight: 235, alignItems: 'center', justifyContent: 'center', padding: 26 },
  icon: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  workout: { gap: 8 },
  workoutTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  calendar: { gap: 12 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { textTransform: 'capitalize' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', height: 32, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, fontWeight: '700' },
  day: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  outsideMonth: { opacity: 0.45 },
  dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  dayDotPlaceholder: { width: 4, height: 4, marginTop: 2 },
  calendarFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  emptyDate: { minHeight: 90, alignItems: 'center', justifyContent: 'center' },
});

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
