import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { SetBand } from '../../domain/equipment';
import { Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { formatNumber } from '../../shared/utils/format';
import { bandsById, useEquipment } from './useEquipment';

/** The exact bands of one set: a colour swatch per band, then their names, tension and the help in kg. */
export function BandsLine({ bands, assistKg = null }: { bands: readonly SetBand[]; assistKg?: number | null }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { catalog } = useEquipment();
  if (bands.length === 0) return null;
  const byId = catalog ? bandsById(catalog) : null;
  const names = bands.map((band) => t('bands.chip', { name: byId?.get(band.bandId)?.name ?? t('bands.unknown'), tension: band.tension }));
  const kg = assistKg === null ? null : t('bands.assistShort', { value: formatNumber(assistKg) });
  const text = [names.join(' + '), kg].filter(Boolean).join(' · ');
  return (
    <View style={styles.line} accessible accessibilityLabel={`${t('bands.title')}: ${text}`}>
      <View style={styles.swatches}>
        {bands.map((band, position) => (
          <View key={`${band.bandId}-${position}`} style={[styles.swatch, { backgroundColor: byId?.get(band.bandId)?.color ?? palette.textMuted, borderColor: palette.text }]} />
        ))}
      </View>
      <Text style={[styles.text, { color: palette.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  swatches: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  text: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, flexShrink: 1 },
});
