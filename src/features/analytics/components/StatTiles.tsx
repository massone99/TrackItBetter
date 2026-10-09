import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';

/** A bordered row of big numbers with their labels: the estimates, records and week figures of an exercise, and the estimator. */
export function StatRow({ children }: PropsWithChildren) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <View style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}>{children}</View>;
}

export function StatTile({ value, label }: { value: string; label: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={styles.item}>
      <Text style={[styles.value, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, paddingVertical: 18 },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  value: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
