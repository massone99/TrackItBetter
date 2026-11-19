import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { completedSetCount, groupSets } from '../../domain/setPairs';
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
        const count = groupSets(exercise.sets).length;
        const share = count > 0 ? completedSetCount(exercise.sets) / count : 0;
        const finished = share === 1;
        return (
          <View key={exercise.entryId} style={[styles.segment, { backgroundColor: palette.border }]}>
            <View style={[styles.fill, { width: `${finished ? 100 : share > 0 ? share * 100 : exercise.entryId === currentId ? 100 : 0}%`, backgroundColor: finished ? palette.success : palette.accentStrong, opacity: finished || exercise.entryId === currentId || share > 0 ? 1 : 0 }]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, minWidth: 6, height: 4, overflow: 'hidden' },
  fill: { height: 4 },
});
