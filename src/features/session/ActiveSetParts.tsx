import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Tag, Text } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, MIN_TOUCH_TARGET, spacing } from '../../shared/theme/tokens';

/** State line of the set in hand: where it is (ready, active, hold running, logged) and what the same set was last time. */
export function ActiveSetStatus({ state, reference }: { state: string; reference: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={styles.status} accessible accessibilityLabel={`${state}. ${reference}`}>
      <Tag color={palette.accentStrong}>{state}</Tag>
      <Text style={[styles.reference, { color: palette.textMuted }]}>{reference}</Text>
    </View>
  );
}

export interface RatingCell {
  id: 'rpe' | 'form' | 'rom';
  label: string;
  /** "8", "3.5"; null shows a dash, never a zero. */
  value: string | null;
  /** Small line under the value, e.g. the target RPE. */
  hint?: string;
  open: boolean;
  onPress: () => void;
}

/** RPE, form and ROM side by side; a tap opens that picker below, one at a time. Always shows a value or a dash. */
export function RatingCells({ cells }: { cells: RatingCell[] }) {
  const styles = useScaledStyles(baseStyles);
  const { palette, largeText } = useTheme();
  const ink = useInk();
  return (
    <View style={[styles.cells, !largeText && styles.cellsRow]}>
      {cells.map((cell) => (
        <Pressable
          key={cell.id}
          accessibilityRole="button"
          accessibilityLabel={`${cell.label} ${cell.value ?? '—'}`}
          accessibilityState={{ expanded: cell.open }}
          onPress={cell.onPress}
          style={({ pressed }) => [styles.cell, largeText && styles.cellLarge, { borderColor: cell.open ? palette.accentStrong : ink, backgroundColor: cell.open ? palette.accentSoft : palette.surface }, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.cellLabel, { color: palette.textMuted }]}>{cell.label}</Text>
          <Text style={[styles.cellValue, { color: cell.value === null ? palette.textMuted : palette.text }]}>{cell.value ?? '—'}</Text>
          {cell.hint ? <Text style={[styles.cellHint, { color: palette.textMuted }]}>{cell.hint}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Band strip of the set in hand: swatches, text and the estimated help, with one button that opens the editor below. */
export function BandsStrip({ title, text, colors, assist, open, actionLabel, onPress }: { title: string; text: string; colors: string[]; assist: string | null; open: boolean; actionLabel: string; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <View style={[styles.bands, { borderColor: ink, backgroundColor: palette.surface }]}>
      <View style={styles.bandsText}>
        <Tag>{title}</Tag>
        <View style={styles.swatchRow}>
          {colors.map((color, index) => <View key={`${color}-${index}`} style={[styles.swatch, { backgroundColor: color, borderColor: palette.border }]} />)}
          <Text style={[styles.bandName, { color: palette.text }]}>{text}</Text>
        </View>
        {assist ? <Text style={[styles.reference, { color: palette.textMuted }]}>{assist}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{ expanded: open }} onPress={onPress} style={({ pressed }) => [styles.bandsAction, { borderColor: ink }, pressed && { opacity: 0.6 }]}>
        <Icon name={open ? 'chevron-up' : 'create-outline'} size={18} color={palette.accentStrong} />
        <Text style={[styles.bandsActionText, { color: palette.accentStrong }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  status: { gap: spacing.xs, paddingVertical: spacing.sm },
  reference: { fontSize: 13 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  cellsRow: { flexWrap: 'nowrap' },
  cell: { flexGrow: 1, flexBasis: 0, minWidth: 0, minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderRadius: instrument.radius, padding: spacing.sm, gap: spacing.xs },
  cellLarge: { flexBasis: 120, minWidth: 120 },
  cellLabel: { fontSize: 12 },
  cellValue: { fontSize: 22, fontWeight: '700' },
  cellHint: { fontSize: 12 },
  bands: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: instrument.radius, padding: spacing.sm, marginVertical: spacing.sm },
  bandsText: { flexGrow: 1, flexBasis: 160, minWidth: 0, gap: spacing.xs },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 14, height: 14, borderWidth: 1, borderRadius: instrument.radius },
  bandName: { fontSize: 15, fontWeight: '600' },
  bandsAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: instrument.radius },
  bandsActionText: { fontSize: 14, fontWeight: '600' },
});
