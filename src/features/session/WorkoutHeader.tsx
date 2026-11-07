import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';
import { Tag, useInk } from './instrument';
import { WorkoutStopwatch } from './WorkoutStopwatch';

/**
 * Top of the workout page: back, the session's name and the menu in one row, and a strip of three readings (time, sets,
 * volume) drawn like an instrument panel.
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
  const titleNode = (
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
  );
  return (
    <View style={styles.header}>
      {/* Back, the session's name and the menu share one row; at large text the name gets its own line, so it never breaks inside a word. */}
      <View style={styles.topRow}>
        <IconButton icon="arrow-back" tone="plain" label={t('common.back')} onPress={goBack} />
        {largeText ? <View style={styles.titleTap} /> : titleNode}
        <View style={[styles.menuFrame, { borderColor: ink, backgroundColor: palette.surface }]}>
          <IconButton icon="ellipsis-horizontal" tone="plain" label={t('workout.menu')} onPress={onMenu} />
        </View>
      </View>
      {largeText ? titleNode : null}
      <View style={[styles.readings, { borderColor: ink, backgroundColor: palette.surface }]}>
        <View style={[styles.reading, largeText && styles.readingLarge]}>
          <Tag>{t('workout.statTime')}</Tag>
          <WorkoutStopwatch startedAt={startedAt} size={20} bare />
        </View>
        <View style={[styles.reading, largeText && styles.readingLarge, styles.readingDivided, { borderLeftColor: palette.border }]}>
          <Tag>{t('workout.statSets')}</Tag>
          <Text style={[styles.figure, { color: palette.text }]}>{`${done}/${total}`}</Text>
        </View>
        <View style={[styles.reading, largeText && styles.readingLarge, styles.readingDivided, { borderLeftColor: palette.border }]}>
          <Tag>{t('workout.statVolume')}</Tag>
          <Text style={[styles.figure, { color: palette.text }]}>{formatNumber(Math.round(volumeKg))}</Text>
        </View>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  header: { gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleTap: { flex: 1, minWidth: 0 },
  menuFrame: { borderWidth: instrument.line, borderRadius: instrument.radius },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, textTransform: 'uppercase' },
  readings: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: instrument.line, borderRadius: instrument.radius },
  reading: { flexGrow: 1, flexBasis: 96, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, justifyContent: 'center' },
  // Large text: two readings per row, so no label breaks inside a word.
  readingLarge: { flexBasis: 140 },
  readingDivided: { borderLeftWidth: StyleSheet.hairlineWidth },
  figure: { fontFamily: fonts.monoBold, fontSize: 20, lineHeight: 26, fontVariant: ['tabular-nums'] },
});
