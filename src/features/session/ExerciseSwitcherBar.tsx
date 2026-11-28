import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { completedSetCount, groupSets } from '../../domain/setPairs';
import { Icon, IconButton, Text, tapFeedback } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import type { SessionExercise } from './repository';

/**
 * Compact 1-tap exercise switcher shown under the workout header when focused on an exercise:
 * previous/next buttons flanking a horizontally scrollable strip of every exercise in the workout.
 */
export function ExerciseSwitcherBar({ exercises, currentId, onSelect }: {
  exercises: SessionExercise[];
  currentId: string;
  onSelect: (exercise: SessionExercise) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const styles = useScaledStyles(baseStyles);
  const scrollRef = useRef<ScrollView>(null);
  const chipLayouts = useRef(new Map<string, { x: number; width: number }>());
  const viewportWidth = useRef(0);

  const currentIndex = exercises.findIndex((item) => item.entryId === currentId);
  const previous = currentIndex > 0 ? exercises[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < exercises.length - 1 ? exercises[currentIndex + 1] : null;

  useEffect(() => {
    const layout = chipLayouts.current.get(currentId);
    if (!layout || viewportWidth.current <= 0) return;
    const targetX = Math.max(0, layout.x - (viewportWidth.current - layout.width) / 2);
    scrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [currentId]);

  if (exercises.length <= 1) return null;

  return (
    <View style={styles.bar}>
      <View style={[styles.navFrame, { borderColor: previous ? ink : palette.border, backgroundColor: palette.surface }]}>
        <IconButton
          icon="chevron-back"
          tone="plain"
          label={previous ? `${t('liveWorkout.previousMovement')}: ${previous.name}` : t('liveWorkout.previousMovement')}
          disabled={!previous}
          onPress={() => { if (previous) onSelect(previous); }}
        />
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => { viewportWidth.current = event.nativeEvent.layout.width; }}
        style={styles.scroller}
        contentContainerStyle={styles.strip}
      >
        {exercises.map((exercise, index) => {
          const active = exercise.entryId === currentId;
          const total = groupSets(exercise.sets).length;
          const done = completedSetCount(exercise.sets);
          const finished = total > 0 && done === total;
          return (
            <Pressable
              key={exercise.entryId}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${index + 1}. ${exercise.name}, ${t('liveWorkout.count', { done, total })}`}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                chipLayouts.current.set(exercise.entryId, { x, width });
              }}
              onPress={() => {
                if (active) return;
                tapFeedback();
                onSelect(exercise);
              }}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: active ? palette.accentStrong : finished ? palette.success : palette.border,
                  backgroundColor: active ? palette.accentSoft : palette.surface,
                  opacity: pressed ? 0.75 : 1,
                },
                active && styles.chipActive,
              ]}
            >
              {finished ? (
                <Icon name="checkmark-circle" size={15} color={palette.success} />
              ) : (
                <Text style={[styles.index, { color: active ? palette.accentStrong : palette.textMuted }]}>
                  {index + 1}
                </Text>
              )}
              <Text
                numberOfLines={1}
                style={[styles.name, { color: active ? palette.accentStrong : palette.text }]}
              >
                {exercise.name}
              </Text>
              <Text style={[styles.progress, { color: finished ? palette.success : active ? palette.accentStrong : palette.textMuted }]}>
                {done}/{total}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.navFrame, { borderColor: next ? ink : palette.border, backgroundColor: palette.surface }]}>
        <IconButton
          icon="chevron-forward"
          tone="plain"
          label={next ? `${t('liveWorkout.nextMovement')}: ${next.name}` : t('liveWorkout.nextMovement')}
          disabled={!next}
          onPress={() => { if (next) onSelect(next); }}
        />
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  navFrame: { borderWidth: 1, borderRadius: radii.control, flexShrink: 0 },
  scroller: { flex: 1, minWidth: 0 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 1 },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.control,
  },
  chipActive: { borderWidth: 1.5 },
  index: { fontFamily: fonts.monoBold, fontSize: 12, lineHeight: 16 },
  name: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  progress: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16 },
});
