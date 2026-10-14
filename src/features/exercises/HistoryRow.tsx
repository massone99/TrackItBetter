import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ExerciseHistorySession } from '../analytics/repository';
import { Icon, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { describeSets } from './describeSets';
import { amountOf, perSet } from '../../domain/lastTime';
import { formatClock, formatNumber } from '../../shared/utils/format';

/** One logged session: its date and workout, and every set on one line. */
export function HistoryRow({ session, older, metric, locale, first, exerciseId }: { session: ExerciseHistorySession; /** The session before this one, to show how it went compared with it. */ older?: ExerciseHistorySession; metric: string; locale: string; first: boolean; exerciseId: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { t } = useTranslation();
  const date = session.startedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const working = session.sets.filter((set) => set.kind !== 'warmup');
  const mean = (values: (number | null | undefined)[]) => { const ok = values.filter((value): value is number => value != null); return ok.length ? Math.round((ok.reduce((sum, value) => sum + value, 0) / ok.length) * 10) / 10 : null; };
  const rpe = mean(working.map((set) => set.rpe));
  const form = mean(working.map((set) => set.formRating));
  const averages = [rpe !== null ? `RPE ${formatNumber(rpe)}` : null, form !== null ? `${t('lastTime.form').toLowerCase()} ${formatNumber(form)}` : null].filter(Boolean).join(' · ');
  const total = (item: ExerciseHistorySession) => perSet(item.sets.map((set) => ({ ...set, completedAt: new Date() })), (set) => amountOf(set, metric)).reduce((sum, value) => sum + value, 0);
  const delta = older ? Math.round((total(session) - total(older)) * 10) / 10 : null;
  const timed = metric === 'time' || metric === 'time_load';
  const trend = delta === null ? null : delta === 0 ? { text: '=', color: palette.textMuted }
    : { text: `${delta > 0 ? '↑ +' : '↓ −'}${timed ? formatClock(Math.abs(delta)) : formatNumber(Math.abs(delta))}`, color: delta > 0 ? palette.success : palette.warning };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${date}, ${session.workoutName}: ${describeSets(session.sets, metric)}`}
      onPress={() => router.push({ pathname: '/workout/entry/[entryId]', params: { entryId: session.entryId, workout: session.workoutId, exercise: exerciseId } })}
      style={({ pressed }) => [styles.historyRow, !first && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.historyDate}>
        <Text style={[styles.historyDay, { color: palette.text }]}>{session.startedAt.getDate()}</Text>
        <Text style={[styles.historyMonth, { color: palette.textMuted }]}>{session.startedAt.toLocaleDateString(locale, { month: 'short' })}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.historyWorkout, { color: palette.textMuted }]}>{session.workoutName}</Text>
        <Text style={[styles.historySets, { color: palette.text }]}>{describeSets(session.sets, metric)}</Text>
        {averages ? <Text style={[styles.historyAverages, { color: palette.textMuted }]}>{averages}</Text> : null}
      </View>
      {trend ? <Text style={[styles.historyTrend, { color: trend.color }]}>{trend.text}</Text> : null}
      <Icon name="chevron-forward" size={16} color={palette.textMuted} />
    </Pressable>
  );
}


const baseStyles = StyleSheet.create({
  flex: { flex: 1 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16, minHeight: 72 },
  historyDate: { width: 40, alignItems: 'center' },
  historyDay: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, fontVariant: ['tabular-nums'] },
  historyMonth: { fontFamily: fonts.medium, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  historyWorkout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  historyAverages: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 2 },
  historyTrend: { fontFamily: fonts.semibold, fontSize: 13, fontVariant: ['tabular-nums'] },
  historySets: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, marginTop: 4, fontVariant: ['tabular-nums'] },
});
