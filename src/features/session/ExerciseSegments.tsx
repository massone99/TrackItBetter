import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../shared/theme/ThemeProvider';
import type { SessionExercise } from './repository';

/** One segment per exercise: green when finished, blue for the one in hand, filled by the sets done. */
export function ExerciseSegments({ exercises, currentId, done, total }: { exercises: SessionExercise[]; currentId: string | null; done: number; total: number }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('logger.setsProgress', { done, total })}
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={styles.row}
    >
      {exercises.map((exercise) => {
        // Each side of an L/R set counts, so the bar moves with every set logged.
        const count = exercise.sets.length;
        const share = count > 0 ? exercise.sets.filter((set) => set.completedAt).length / count : 0;
        const finished = share === 1;
        return (
          <View key={exercise.entryId} style={[styles.segment, { backgroundColor: palette.border }, exercise.entryId === currentId && share === 0 && { borderWidth: 1, borderColor: palette.accentStrong }]}>
            <View style={[styles.fill, { width: `${finished ? 100 : share * 100}%`, backgroundColor: finished ? palette.success : palette.accentStrong, opacity: share > 0 ? 1 : 0 }]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, minWidth: 6, height: 6, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%' },
});
