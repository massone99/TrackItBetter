import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, Text } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, spacing } from '../../shared/theme/tokens';

/**
 * The fold over a set's chips (RPE, form, ROM, bands, rest, note, clips): folded by default, it reads as one quiet line:
 * a ruled label, what the set already carries (so nothing is lost while folded) and a chevron. `trailing` sits outside
 * the toggle (the set menu), so a tap there never folds or unfolds.
 */
export function ChipsFold({ label, summary, record, open, onPress, trailing, style }: { label: string; summary: string; record: boolean; open: boolean; onPress: () => void; trailing?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <View style={[styles.fold, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${summary ? `. ${summary}` : ''}`}
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        hitSlop={{ top: spacing.sm, bottom: spacing.sm }} // 32 + 8 + 8: the full 48 dp target without 48 dp of empty row
        style={({ pressed }) => [styles.foldPress, pressed && { opacity: 0.6 }]}
      >
        <View style={[styles.foldTab, { borderColor: open ? palette.accentStrong : ink }]}>
          <Text style={[styles.foldLabel, { color: open ? palette.accentStrong : palette.textMuted }]}>{label}</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={open ? palette.accentStrong : palette.textMuted} />
        </View>
        {record ? <Icon name="trophy" size={14} color={palette.record} /> : null}
        {!open && summary ? <Text style={[styles.foldSummary, { color: palette.textMuted }]}>{summary}</Text> : null}
      </Pressable>
      {trailing}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  fold: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  foldPress: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET - 2 * spacing.sm },
  foldTab: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderBottomWidth: 1, paddingBottom: 2 },
  foldLabel: { fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  foldSummary: { fontSize: 12, letterSpacing: 0.5, flexShrink: 1 },
});
