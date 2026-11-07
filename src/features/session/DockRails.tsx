import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Tag, Text, tapFeedback } from '../../shared/components/ui';
import type { IconName } from '../../shared/components/ui';
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

/** Two collapsible rails under the main action: each opens its panel above the action; one panel at a time. At large text only the names show. */
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
            {rail.summary && !largeText ? <Text style={[styles.railSummary, { color: rail.id === 'telemetry' ? palette.success : palette.textMuted }]}>{rail.summary}</Text> : null}
          </View>
          <Icon name={rail.open ? 'chevron-down' : 'chevron-up'} size={18} color={palette.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

export interface DockOption {
  id: string;
  icon: IconName;
  label: string;
  /** One quiet line under the label. */
  hint: string;
  /** `primary` fills its icon tile with the accent, `danger` uses the warning colour and sits apart at the end. */
  tone: 'normal' | 'primary' | 'danger';
  onPress: () => void;
}

/**
 * What the Workout rail opens: a vertical list of options in the grouped-list pattern of Android and iOS settings (an icon
 * tile, a title with a quiet line under it, a chevron, hairlines between rows), with the destructive option set apart at the end.
 */
export function WorkoutDockPanel({ title, options }: { title: string; options: DockOption[] }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const safe = options.filter((option) => option.tone !== 'danger');
  const danger = options.filter((option) => option.tone === 'danger');
  const row = (option: DockOption, last: boolean) => {
    const color = option.tone === 'danger' ? palette.warning : palette.text;
    const tileColor = option.tone === 'primary' ? palette.accent : option.tone === 'danger' ? palette.surfaceMuted : palette.surfaceMuted;
    const iconColor = option.tone === 'primary' ? palette.accentText : option.tone === 'danger' ? palette.warning : palette.text;
    return (
      <Pressable
        key={option.id}
        accessibilityRole="button"
        accessibilityLabel={`${option.label}. ${option.hint}`}
        onPress={() => { tapFeedback(); option.onPress(); }}
        style={({ pressed }) => [styles.option, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }, pressed && { backgroundColor: palette.surfaceMuted }]}
      >
        <View style={[styles.tile, { backgroundColor: tileColor }]}>
          <Icon name={option.icon} size={22} color={iconColor} />
        </View>
        <View style={styles.optionText}>
          <Text style={[styles.optionLabel, { color }]}>{option.label}</Text>
          <Text style={[styles.optionHint, { color: palette.textMuted }]}>{option.hint}</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={palette.textMuted} />
      </Pressable>
    );
  };
  return (
    <View style={styles.menu}>
      <Tag style={styles.menuTitle}>{title}</Tag>
      <View style={[styles.group, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        {safe.map((option, index) => row(option, index === safe.length - 1))}
      </View>
      {danger.length > 0 ? (
        <View style={[styles.group, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          {danger.map((option, index) => row(option, index === danger.length - 1))}
        </View>
      ) : null}
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
  menu: { gap: spacing.sm },
  menuTitle: { paddingHorizontal: spacing.xs },
  group: { borderWidth: 1, borderRadius: instrument.radius, overflow: 'hidden' },
  option: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: instrument.radius },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionLabel: { fontSize: 16, fontWeight: '700' },
  optionHint: { fontSize: 13 },
});
