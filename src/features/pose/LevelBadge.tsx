import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/** Level 1–5 of a position, in the birch "record" colour. */
export function LevelBadge({ level, compact = false }: { level: number; compact?: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  return (
    <View style={[compact ? styles.compact : styles.badge, { backgroundColor: palette.recordSoft }]}>
      <Text style={[compact ? styles.compactNumber : styles.number, { color: palette.record }]}>{t('pose.level', { level })}</Text>
      {compact ? null : <Text style={[styles.name, { color: palette.record }]}>{t(`pose.level${level}`)}</Text>}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  badge: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 },
  number: { fontFamily: fonts.display, fontSize: 22 },
  name: { fontFamily: fonts.semibold, fontSize: 13 },
  compact: { paddingHorizontal: 10, height: 26, borderRadius: 999, justifyContent: 'center' },
  compactNumber: { fontFamily: fonts.semibold, fontSize: 13 },
});
