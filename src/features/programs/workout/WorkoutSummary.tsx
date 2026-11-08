import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { formatMinutes } from '../../../shared/utils/format';
import type { Volume } from '../builder/helpers';

/** Live strip in mono: exercises · working sets · about N min, then sets per category with the low ones in warning. */
export function WorkoutSummary({ exercises, workingSets, volume }: { exercises: number; workingSets: number; volume: Volume }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  if (exercises === 0) return null;
  const strip = [
    t('workoutBuilder.exercises', { count: exercises }),
    t('workoutBuilder.workingSets', { count: workingSets }),
    `~${formatMinutes(volume.seconds)}`,
  ].join(' · ');
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text style={[styles.strip, { color: palette.text }]}>{strip}</Text>
      {volume.byCategory.length > 0 ? (
        <View style={styles.row}>
          {volume.byCategory.map(([category, sets]) => {
            const low = volume.low.includes(category);
            return (
              <Text key={category} style={[styles.item, { color: low ? palette.warning : palette.textMuted }]}>
                {`${t(`library.category.${category}`, { defaultValue: category })} ${sets}${low ? ' ▼' : ''}`}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  strip: { fontFamily: fonts.monoSemibold, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' },
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  item: { fontFamily: fonts.mono, fontSize: 13 },
});
