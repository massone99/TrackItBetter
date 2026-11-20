import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text, tapFeedback } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { STACK_TEXT_SCALE } from '../../shared/theme/scale';
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
  const { palette, fontScale } = useTheme();
  const ink = useInk();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'));
  // "Push Pull Legs · Push": the program goes above, the workout is the title.
  const split = title.indexOf(' · ');
  const eyebrow = split > 0 ? title.slice(0, split) : null;
  const name = split > 0 ? title.slice(split + 3) : title;
  const sets = t('simple.setsCount', { done, total });
  const progressLine = position ? `${t('simple.exercisePosition', { current: position, total: exercises.length })} · ${sets}` : sets;
  const progress = (
    <>
      {exercises.length > 0 ? <ExerciseSegments exercises={exercises} currentId={currentId} done={done} total={total} /> : null}
      <View style={styles.progressText}>
        <Text style={[styles.mono, styles.flex, { color: palette.textMuted }]}>{progressLine}</Text>
        {position && onBack ? <Text style={[styles.mono, { color: palette.accentStrong }]}>{t('simple.allExercisesLink')}</Text> : null}
      </View>
    </>
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={[styles.leading, fontScale >= STACK_TEXT_SCALE && styles.leadingLarge]}>
          <IconButton icon="arrow-back" tone="plain" label={t(onBack ? 'liveWorkout.overview' : 'common.back')} onPress={onBack ?? goBack} />
          <Pressable
            accessibilityRole="header"
            accessibilityLabel={title}
            accessibilityHint={titleLongPressLabel}
            onLongPress={onTitleLongPress}
            delayLongPress={500}
            style={styles.middle}
          >
            {eyebrow ? <Text style={[styles.mono, { color: palette.textMuted }]}>{eyebrow}</Text> : null}
            <Text style={[styles.title, { color: palette.text }]}>{name}</Text>
          </Pressable>
        </View>
        <View style={styles.trailing}>
          <WorkoutStopwatch startedAt={startedAt} size={15} bare />
          <View style={[styles.menuFrame, { borderColor: ink, backgroundColor: palette.surface }]}>
            <IconButton icon="ellipsis-horizontal" tone="plain" label={t('workout.menu')} onPress={onMenu} />
          </View>
        </View>
      </View>
      {position && onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${progressLine}. ${t('simple.allExercises')}`} onPress={() => { tapFeedback(); onBack(); }} style={styles.progress}>
          {progress}
        </Pressable>
      ) : <View accessible accessibilityLabel={progressLine} style={styles.progress}>{progress}</View>}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  leading: { flexDirection: 'row', flexGrow: 1, flexBasis: 176, minWidth: 0, alignItems: 'center', gap: spacing.sm },
  leadingLarge: { flexBasis: 260 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  middle: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: 48 },
  menuFrame: { borderWidth: 1, borderRadius: radii.control },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, textTransform: 'uppercase' },
  progress: { gap: 6, paddingVertical: spacing.sm, minHeight: 48, justifyContent: 'center' },
  progressText: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flexGrow: 1, flexShrink: 1 },
  mono: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.7, textTransform: 'uppercase' },
});
