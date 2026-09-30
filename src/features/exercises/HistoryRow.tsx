import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ExerciseHistorySession } from '../analytics/repository';
import { Icon, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { describeSets } from './describeSets';

/** One logged session: its date and workout, and every set on one line. */
export function HistoryRow({ session, metric, locale, first }: { session: ExerciseHistorySession; metric: string; locale: string; first: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const date = session.startedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${date}, ${session.workoutName}: ${describeSets(session.sets, metric)}`}
      onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: session.workoutId } })}
      style={({ pressed }) => [styles.historyRow, !first && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.historyDate}>
        <Text style={[styles.historyDay, { color: palette.text }]}>{session.startedAt.getDate()}</Text>
        <Text style={[styles.historyMonth, { color: palette.textMuted }]}>{session.startedAt.toLocaleDateString(locale, { month: 'short' })}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.historyWorkout, { color: palette.textMuted }]}>{session.workoutName}</Text>
        <Text style={[styles.historySets, { color: palette.text }]}>{describeSets(session.sets, metric)}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={palette.textMuted} />
    </Pressable>
  );
}


const baseStyles = StyleSheet.create({
  flex: { flex: 1 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 60 },
  historyDate: { width: 40, alignItems: 'center' },
  historyDay: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, fontVariant: ['tabular-nums'] },
  historyMonth: { fontFamily: fonts.medium, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  historyWorkout: { fontFamily: fonts.medium, fontSize: 13 },
  historySets: { fontFamily: fonts.semibold, fontSize: 15, marginTop: 2, fontVariant: ['tabular-nums'] },
});
