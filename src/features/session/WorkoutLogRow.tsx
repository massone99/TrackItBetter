import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import type { WorkoutHistoryItem } from './repository';
import { displayWorkoutName } from './workoutName';

/**
 * A finished workout as one compact row of the Log: the name over "Mon 6 Oct · 83 min · 20 sets",
 * divided from the next by a hairline, like the sections of a workout. Opens the workout.
 */
export function WorkoutLogRow({ workout, locale, first }: { workout: WorkoutHistoryItem; locale: string; first: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const name = displayWorkoutName(workout.name, t('log.pastName'));
  const minutes = Math.max(0, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));
  const meta = [
    workout.startedAt.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
    `${minutes} min`,
    t('log.setCount', { count: workout.setCount }),
  ].join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('log.openWorkout', { name })}, ${meta}`}
      onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: workout.id } })}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }, pressed && { backgroundColor: palette.surfaceMuted }]}
    >
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>{name}</Text>
        <Text style={[styles.meta, { color: palette.textMuted }]}>{meta}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={palette.textMuted} />
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 4 },
  copy: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
});
