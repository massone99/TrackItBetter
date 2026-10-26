import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, MIN_TOUCH_TARGET, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';
import { Tag, useInk } from './instrument';
import { WorkoutStopwatch } from './WorkoutStopwatch';

/**
 * Top of the workout page: back and menu, the session's name, and a strip of three readings (time, sets,
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
  const { palette } = useTheme();
  const ink = useInk();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'));
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <IconButton icon="arrow-back" tone="plain" label={t('common.back')} onPress={goBack} />
        <View style={[styles.menuFrame, { borderColor: ink, backgroundColor: palette.surface }]}>
          <IconButton icon="ellipsis-horizontal" tone="plain" label={t('workout.menu')} onPress={onMenu} />
        </View>
      </View>
      <Tag>{t('workout.session')}</Tag>
      <Pressable
        accessibilityRole="header"
        accessibilityLabel={title}
        accessibilityHint={titleLongPressLabel}
        onLongPress={onTitleLongPress}
        delayLongPress={500}
      >
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      </Pressable>
      <View style={[styles.readings, { borderColor: ink, backgroundColor: palette.surface }]}>
        <View style={styles.reading}>
          <Tag>{t('workout.statTime')}</Tag>
          <WorkoutStopwatch startedAt={startedAt} size={22} bare />
        </View>
        <View style={[styles.reading, styles.readingDivided, { borderLeftColor: palette.border }]}>
          <Tag>{t('workout.statSets')}</Tag>
          <Text style={[styles.figure, { color: palette.text }]}>{`${done}/${total}`}</Text>
        </View>
        <View style={[styles.reading, styles.readingDivided, { borderLeftColor: palette.border }]}>
          <Tag>{t('workout.statVolume')}</Tag>
          <Text style={[styles.figure, { color: palette.text }]}>{formatNumber(Math.round(volumeKg))}</Text>
        </View>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  header: { gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuFrame: { borderWidth: instrument.line, borderRadius: instrument.radius },
  title: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38, textTransform: 'uppercase' },
  readings: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: instrument.line, borderRadius: instrument.radius },
  reading: { flexGrow: 1, flexBasis: 96, minHeight: MIN_TOUCH_TARGET + spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center' },
  readingDivided: { borderLeftWidth: StyleSheet.hairlineWidth },
  figure: { fontFamily: fonts.monoBold, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] },
});
