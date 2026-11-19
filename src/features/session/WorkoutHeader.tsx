import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { WorkoutStopwatch } from './WorkoutStopwatch';

export function WorkoutHeader({ title, startedAt, done, total, onBack, onTitleLongPress, titleLongPressLabel, onMenu }: {
  title: string;
  startedAt: Date;
  done: number;
  total: number;
  onBack?: () => void;
  onTitleLongPress: () => void;
  titleLongPressLabel: string;
  onMenu: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'));
  const summary = (
    <View style={styles.summary}>
      <WorkoutStopwatch startedAt={startedAt} size={13} bare />
      <Text
        accessible
        accessibilityLabel={t('logger.setsProgress', { done, total })}
        style={[styles.summaryText, { color: palette.textMuted }]}
      >
        {`${t('liveWorkout.elapsed')} · `}<Text style={[styles.summaryCount, { color: palette.text }]}>{`${done}/${total}`}</Text>{` ${t('workout.statSets').toLowerCase()}`}
      </Text>
    </View>
  );
  return (
    <View>
      <View style={styles.topRow}>
        <IconButton icon="arrow-back" tone="plain" label={t(onBack ? 'liveWorkout.overview' : 'common.back')} onPress={onBack ?? goBack} />
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
          {summary}
        </View>
        <View style={[styles.menuFrame, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <IconButton icon="ellipsis-horizontal" tone="plain" label={t('workout.menu')} onPress={onMenu} />
        </View>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  middle: { flex: 1, minWidth: 0, gap: 3 },
  titleTap: { flexShrink: 1, minWidth: 0, justifyContent: 'center' },
  menuFrame: { borderWidth: 1, borderRadius: 4 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.xs },
  summaryCount: { fontFamily: fonts.monoBold },
  summaryText: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
});
