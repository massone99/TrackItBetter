import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';
import { useInk } from '../../shared/theme/ink';
import { WorkoutStopwatch } from './WorkoutStopwatch';

/**
 * Top of the workout page, one compact line ("Ledger"): back, the session's name with a mono summary on its baseline
 * (live time · sets done/total · volume kg), and the menu. Name and summary wrap onto two lines when narrow; at large
 * text the name gets its own line and the summary goes under it.
 */
export function WorkoutHeader({ title, startedAt, done, total, volumeKg, onTitleLongPress, titleLongPressLabel, onMenu }: {
  title: string;
  startedAt: Date;
  done: number;
  total: number;
  volumeKg: number;
  onTitleLongPress: () => void;
  titleLongPressLabel: string;
  onMenu: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, largeText } = useTheme();
  const ink = useInk();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'));
  const volume = formatNumber(Math.round(volumeKg));
  const summary = (
    <View style={styles.summary}>
      <WorkoutStopwatch startedAt={startedAt} size={13} color={palette.textMuted} bare />
      <Text
        accessible
        accessibilityLabel={t('workout.headerProgress', { done, total, volume })}
        style={[styles.summaryText, { color: palette.textMuted }]}
      >
        {`· ${done}/${total} ${t('workout.statSets').toLowerCase()} · ${volume} kg`}
      </Text>
    </View>
  );
  return (
    <View>
      <View style={styles.topRow}>
        <IconButton icon="arrow-back" tone="plain" label={t('common.back')} onPress={goBack} />
        <View style={styles.middle}>
          <Pressable
            accessibilityRole="header"
            accessibilityLabel={title}
            accessibilityHint={titleLongPressLabel}
            onLongPress={onTitleLongPress}
            delayLongPress={500}
            style={styles.titleTap}
          >
            <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          </Pressable>
          {largeText ? null : summary}
        </View>
        <View style={[styles.menuFrame, { borderColor: ink, backgroundColor: palette.surface }]}>
          <IconButton icon="ellipsis-horizontal" tone="plain" label={t('workout.menu')} onPress={onMenu} />
        </View>
      </View>
      {/* Large text: the summary takes the full width under the row, so it never wraps word by word. */}
      {largeText ? summary : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  middle: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm },
  titleTap: { flexShrink: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' },
  menuFrame: { borderWidth: instrument.line, borderRadius: instrument.radius },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, textTransform: 'uppercase' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.xs },
  summaryText: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
});
