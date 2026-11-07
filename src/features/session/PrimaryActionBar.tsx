import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, tapFeedback } from '../../shared/components/ui';
import type { IconName } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { radii, spacing } from '../../shared/theme/tokens';

/** Height of the main action of the set in hand; the exercise card keeps this much room for it. */
export const PRIMARY_ACTION_HEIGHT = 56;

/**
 * The one action of the set in hand, fixed above the footer: complete the set (or start / stop its hold), with a
 * square button beside it for the set's full details (left out at large text). One row, at least 48 dp high, and it never moves when the
 * metadata or telemetry above it opens or closes.
 */
export function PrimaryActionBar({ label, icon, detailsLabel, onPress, onLongPress, onDetails }: {
  label: string;
  icon: IconName;
  detailsLabel: string;
  onPress: () => void;
  onLongPress?: () => void;
  onDetails: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette, largeText } = useTheme();
  const ink = useInk();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => { tapFeedback(); onPress(); }}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [styles.button, { backgroundColor: palette.accent }, pressed && { opacity: 0.8 }]}
      >
        <Icon name={icon} size={22} color={palette.accentText} />
        <Text style={[styles.label, { color: palette.accentText }]}>{label}</Text>
      </Pressable>
      {/* At large text the label needs the full width; the details stay one tap away in the set's own menu. */}
      {largeText ? null : <Pressable
        accessibilityRole="button"
        accessibilityLabel={detailsLabel}
        onPress={() => { tapFeedback(); onDetails(); }}
        style={({ pressed }) => [styles.details, { borderColor: ink, backgroundColor: palette.surface }, pressed && { opacity: 0.6 }]}
      >
        <Icon name="options-outline" size={22} color={palette.accentStrong} />
      </Pressable>}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  button: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: PRIMARY_ACTION_HEIGHT, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.control },
  label: { flexShrink: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  details: { minWidth: PRIMARY_ACTION_HEIGHT, minHeight: PRIMARY_ACTION_HEIGHT, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radii.control },
});
