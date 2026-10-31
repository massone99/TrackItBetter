import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Tag, Text, tapFeedback } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, MIN_TOUCH_TARGET, spacing } from '../../shared/theme/tokens';

export interface Rail {
  id: 'telemetry' | 'workout';
  label: string;
  /** Short state on the rail ("● Live", "3 / 7"). */
  summary: string | null;
  open: boolean;
  onPress: () => void;
}

/** Two collapsible rails under the main action: each opens its panel above the action; one panel at a time. */
export function DockRails({ rails }: { rails: Rail[] }) {
  const styles = useScaledStyles(baseStyles);
  const { palette, largeText } = useTheme();
  return (
    <View style={styles.rails}>
      {rails.map((rail) => (
        <Pressable
          key={rail.id}
          accessibilityRole="button"
          accessibilityLabel={[rail.label, rail.summary].filter(Boolean).join(' · ')}
          accessibilityState={{ expanded: rail.open }}
          onPress={() => { tapFeedback(); rail.onPress(); }}
          style={({ pressed }) => [styles.rail, largeText && styles.railStacked, { borderColor: rail.open ? palette.accentStrong : palette.border, backgroundColor: rail.open ? palette.accentSoft : palette.surface }, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.railText}>
            <Text style={[styles.railLabel, { color: palette.text }]}>{rail.label.toUpperCase()}</Text>
            {rail.summary ? <Text style={[styles.railSummary, { color: rail.id === 'telemetry' ? palette.success : palette.textMuted }]}>{rail.summary}</Text> : null}
          </View>
          <Icon name={rail.open ? 'chevron-down' : 'chevron-up'} size={18} color={palette.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

/** What the Workout rail opens: where you are in the workout, Add exercise and Finish workout. */
export function WorkoutDockPanel({ title, addLabel, finishLabel, onAdd, onFinish }: { title: string; addLabel: string; finishLabel: string; onAdd: () => void; onFinish: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <View style={[styles.panel, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <Tag>{title}</Tag>
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" accessibilityLabel={addLabel} onPress={() => { tapFeedback(); onAdd(); }} style={({ pressed }) => [styles.button, { borderColor: ink, backgroundColor: palette.background }, pressed && { opacity: 0.7 }]}>
          <Icon name="add" size={20} color={palette.text} />
          <Text style={[styles.buttonText, { color: palette.text }]}>{addLabel.toUpperCase()}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={finishLabel} onPress={() => { tapFeedback(); onFinish(); }} style={({ pressed }) => [styles.button, { borderColor: ink, backgroundColor: palette.surfaceMuted }, pressed && { opacity: 0.7 }]}>
          <Icon name="flag-outline" size={20} color={palette.text} />
          <Text style={[styles.buttonText, { color: palette.text }]}>{finishLabel.toUpperCase()}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  rails: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rail: { flexGrow: 1, flexBasis: 140, minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderWidth: 1, borderRadius: instrument.radius, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  railStacked: { flexBasis: '100%' },
  railText: { flexShrink: 1, minWidth: 0, gap: 2 },
  railLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  railSummary: { fontSize: 12, letterSpacing: 0.5 },
  panel: { borderWidth: 1, borderRadius: instrument.radius, padding: spacing.md, gap: spacing.md },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: { flexGrow: 1, flexBasis: 140, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: instrument.radius, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  buttonText: { flexShrink: 1, fontSize: 14, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
});
