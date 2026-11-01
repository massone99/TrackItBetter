import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, tapFeedback } from '../../shared/components/ui';
import type { IconName } from '../../shared/components/ui';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';

/**
 * The one action of the set in hand, fixed above the footer: complete the set (or start / stop its hold).
 * Under it, a line saying ratings are optional and a link to the set's full details. Always at least 48 dp high,
 * and it never moves when the metadata or telemetry above it opens or closes.
 */
export function PrimaryActionBar({ label, icon, caption, linkLabel, onPress, onLongPress, onLink }: {
  label: string;
  icon: IconName;
  /** Hidden at large text, where the footer has no room for it. */
  caption: string | null;
  linkLabel: string;
  onPress: () => void;
  onLongPress?: () => void;
  onLink: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
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
      {caption ? (
        <View style={styles.caption}>
          <Text style={[styles.captionText, { color: palette.textMuted }]}>{caption}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={linkLabel} hitSlop={spacing.sm} onPress={() => { tapFeedback(); onLink(); }} style={styles.link}>
            <Text style={[styles.captionText, { color: palette.accentStrong }]}>{`${linkLabel.toUpperCase()} ↑`}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  bar: { gap: spacing.sm },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.control },
  label: { flexShrink: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  caption: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  captionText: { flexShrink: 1, fontSize: 12, letterSpacing: 0.5 },
  link: { minHeight: MIN_TOUCH_TARGET - spacing.md, justifyContent: 'center' },
});
