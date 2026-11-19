import { Pressable, StyleSheet, View } from 'react-native';
import { tapFeedback, Text } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';

/**
 * A rating as one segmented row (RPE 6–10, form or ROM 1–5): a tap sets a whole value, a tap on the
 * chosen one clears it. `half` adds a "+½" toggle beside the label that moves the value half a point
 * up (8 → 8.5), so the row stays five wide segments instead of nine narrow ones.
 */
export function ScaleRow({ label, hint, values, value, onChange, half = false, halfLabel, valueLabel }: {
  label: string;
  /** Short text at the right of the label (the planned RPE). */
  hint?: string | null;
  /** The whole values, in order. */
  values: readonly number[];
  value: number | null;
  onChange: (value: number | null) => void;
  half?: boolean;
  /** Screen-reader name of the half-point toggle. */
  halfLabel?: string;
  /** Screen-reader name of one value. */
  valueLabel: (value: number) => string;
}) {
  const { palette } = useTheme();
  const ink = useInk();
  const styles = useScaledStyles(baseStyles);
  const whole = value === null ? null : Math.floor(value);
  const isHalf = value !== null && value % 1 !== 0;
  const max = values[values.length - 1];
  const halfDisabled = whole === null || whole >= max;
  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
        <View style={styles.headEnd}>
          {hint ? <Text style={[styles.hint, { color: palette.textMuted }]}>{hint}</Text> : null}
          {half ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={halfLabel}
              accessibilityState={{ checked: isHalf, disabled: halfDisabled }}
              disabled={halfDisabled}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              onPress={() => { if (whole === null) return; tapFeedback(); onChange(isHalf ? whole : whole + 0.5); }}
              style={[styles.half, { borderColor: isHalf ? palette.accentStrong : ink, backgroundColor: isHalf ? palette.accentSoft : 'transparent', opacity: halfDisabled ? 0.4 : 1 }]}
            >
              <Text style={[styles.halfText, { color: isHalf ? palette.accentStrong : palette.text }]}>+½</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={[styles.segments, { borderColor: ink }]}>
        {values.map((item, index) => {
          const selected = whole === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityLabel={valueLabel(selected && isHalf ? item + 0.5 : item)}
              accessibilityState={{ selected }}
              onPress={() => { tapFeedback(); onChange(selected ? null : item); }}
              style={({ pressed }) => [styles.segment, index > 0 && { borderLeftWidth: 1, borderLeftColor: palette.border }, { backgroundColor: selected ? palette.accentSoft : pressed ? palette.surfaceMuted : palette.surface }]}
            >
              <Text style={[styles.segmentText, { color: selected ? palette.accentStrong : palette.text }, selected && styles.segmentSelected]}>{selected && isHalf ? `${item}½` : String(item)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  block: { gap: spacing.xs + 2 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 28 },
  headEnd: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontFamily: fonts.monoSemibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  hint: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  half: { minWidth: 36, minHeight: 28, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  halfText: { fontFamily: fonts.monoSemibold, fontSize: 13 },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: radii.control, overflow: 'hidden' },
  segment: { flex: 1, minWidth: 0, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: fonts.mono, fontSize: 15 },
  segmentSelected: { fontFamily: fonts.monoBold },
});
