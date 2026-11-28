import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text, tapFeedback } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { ExerciseSegments } from './ExerciseSegments';
import type { SessionExercise } from './repository';
import { WorkoutStopwatch } from './WorkoutStopwatch';

/**
 * Top of the workout: back, program and workout name, the clock and the one workout menu; under it one segment per
 * exercise. On an exercise the segments and the line under them are one button that opens all exercises.
 */
export function WorkoutHeader({ title, startedAt, done, total, exercises, currentId, position, onBack, onTitleLongPress, titleLongPressLabel, onMenu }: {
  title: string;
  startedAt: Date;
  done: number;
  total: number;
  exercises: SessionExercise[];
  currentId: string | null;
  /** 1-based place of the exercise in hand; set only on an exercise, where the progress opens the overview. */
  position?: number;
  onBack?: () => void;
  onTitleLongPress: () => void;
  titleLongPressLabel: string;
  onMenu: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, largeText } = useTheme();
  const ink = useInk();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'));
  // "Push Pull Legs · Push": the program goes above, the workout is the title.
  const split = title.indexOf(' · ');
  const eyebrow = split > 0 ? title.slice(0, split) : null;
  const name = split > 0 ? title.slice(split + 3) : title;
  const sets = t('simple.setsCount', { done, total });
  const progressLine = position ? `${t('simple.exercisePosition', { current: position, total: exercises.length })} · ${sets}` : sets;
  const titleBlock = (
    <Pressable
      accessibilityRole="header"
      accessibilityLabel={title}
      accessibilityHint={titleLongPressLabel}
      onLongPress={onTitleLongPress}
      delayLongPress={500}
      style={[styles.middle, largeText && styles.middleFull]}
    >
      {eyebrow ? <Text style={[styles.mono, { color: palette.textMuted }]}>{eyebrow}</Text> : null}
      {/* Between the back and menu buttons a long word in capitals may not fit: it shrinks to fit, up to two lines. */}
      <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.title, { color: palette.text }]}>{name}</Text>
    </Pressable>
  );
  const progress = (
    <>
      {exercises.length > 0 ? <ExerciseSegments exercises={exercises} currentId={currentId} done={done} total={total} /> : null}
      <View style={[styles.progressText, largeText && styles.progressTextStacked]}>
        <Text style={[styles.mono, styles.progressLine, { color: palette.textMuted }]}>{progressLine}</Text>
        {position && onBack ? <Text style={[styles.mono, styles.allLink, { color: palette.accentStrong }]}>{t('simple.allExercisesLink')}</Text> : null}
      </View>
    </>
  );
  return (
    <View style={styles.wrap}>
      {largeText ? (
        /* Large text / max UI zoom: toolbar row (back, stopwatch, menu) stays crisp and full-width title sits right below so words never split mid-syllable. */
        <>
          <View style={styles.toolbarRow}>
            <IconButton icon="arrow-back" tone="plain" label={t(onBack ? 'liveWorkout.overview' : 'common.back')} onPress={onBack ?? goBack} />
            <View style={styles.trailing}>
              <WorkoutStopwatch startedAt={startedAt} size={15} bare />
              <View style={[styles.menuFrame, { borderColor: ink, backgroundColor: palette.surface }]}>
                <IconButton icon="ellipsis-horizontal" tone="plain" label={t('workout.menu')} onPress={onMenu} />
              </View>
            </View>
          </View>
          {titleBlock}
        </>
      ) : (
        <View style={styles.topRow}>
          <View style={styles.leading}>
            <IconButton icon="arrow-back" tone="plain" label={t(onBack ? 'liveWorkout.overview' : 'common.back')} onPress={onBack ?? goBack} />
            {titleBlock}
          </View>
          <View style={styles.trailing}>
            <WorkoutStopwatch startedAt={startedAt} size={15} bare />
            <View style={[styles.menuFrame, { borderColor: ink, backgroundColor: palette.surface }]}>
              <IconButton icon="ellipsis-horizontal" tone="plain" label={t('workout.menu')} onPress={onMenu} />
            </View>
          </View>
        </View>
      )}
      {position && onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${progressLine}. ${t('simple.allExercises')}`} onPress={() => { tapFeedback(); onBack(); }} style={styles.progress}>
          {progress}
        </Pressable>
      ) : <View accessible accessibilityLabel={progressLine} style={styles.progress}>{progress}</View>}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  leading: { flexDirection: 'row', flexGrow: 1, flexShrink: 1, flexBasis: 176, minWidth: 0, alignItems: 'center', gap: spacing.sm },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  middle: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: 48 },
  middleFull: { flex: 0, width: '100%', minHeight: 36, paddingHorizontal: spacing.xs },
  menuFrame: { borderWidth: 1, borderRadius: radii.control },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, textTransform: 'uppercase' },
  progress: { gap: 6, paddingVertical: spacing.xs, minHeight: 48, justifyContent: 'center' },
  progressText: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.sm, rowGap: spacing.xs },
  progressTextStacked: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'flex-start' },
  progressLine: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  allLink: { flexShrink: 0 },
  mono: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.7, textTransform: 'uppercase' },
});
