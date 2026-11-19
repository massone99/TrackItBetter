import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Label, Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { formatMinutes } from '../../../shared/utils/format';
import type { Volume } from './helpers';

/** Working sets per category (low ones in the warning colour) and the estimated time. */
export function VolumeSummary({ title, volume }: { title: string; volume: Volume }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  if (volume.byCategory.length === 0 && volume.seconds === 0) return null;
  return (
    <View style={styles.box}>
      <Label>{`${title} · ${t('builderPlus.minutes', { minutes: formatMinutes(volume.seconds) })}`}</Label>
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
      {volume.low.length > 0 ? (
        <Text style={[styles.warn, { color: palette.warning }]}>
          {t('builderPlus.low', { list: volume.low.map((category) => t(`library.category.${category}`, { defaultValue: category })).join(', ') })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  item: { fontFamily: fonts.mono, fontSize: 13 },
  warn: { fontFamily: fonts.medium, fontSize: 13 },
});
