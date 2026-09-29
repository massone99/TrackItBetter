import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';

export interface StatsChartProps {
  /** Primary metric per bucket, drawn as bars. */
  values: readonly (number | null)[];
  /** Optional second metric, drawn as a line on its own scale. */
  secondary?: readonly (number | null)[];
  labels: readonly string[];
  selected: number | null;
  onSelect: (index: number) => void;
  formatPrimary: (value: number) => string;
  /** Totals start at zero; bests and averages zoom in so small changes stay visible. */
  zeroBased?: boolean;
  formatSecondary?: (value: number) => string;
  accessibilityLabel: (index: number) => string;
}

const HEIGHT = 170;
const LABEL_COUNT = 5;

/** Bars for one metric with an optional line for a second one; tap a bar to select its period. */
export function StatsChart({ values, secondary, labels, selected, onSelect, formatPrimary, zeroBased = true, formatSecondary, accessibilityLabel }: StatsChartProps) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const [width, setWidth] = useState(300);
  const present = values.filter((value): value is number => value != null && value > 0);
  const primaryMax = Math.max(0, ...present);
  const primaryMin = present.length ? Math.min(...present) : 0;
  const base = zeroBased || !present.length ? 0 : Math.max(0, primaryMin - (primaryMax - primaryMin || primaryMax) * 0.5);
  const secondaryPresent = (secondary ?? []).filter((value): value is number => value != null);
  const secondaryMax = secondaryPresent.length ? Math.max(...secondaryPresent) : 0;
  const slot = width / Math.max(1, values.length);
  const labelEvery = Math.max(1, Math.ceil(values.length / LABEL_COUNT));

  const linePoints = secondary && secondaryMax > 0
    ? secondary.map((value, index) => (value == null ? null : { x: slot * index + slot / 2, y: HEIGHT - 4 - (value / secondaryMax) * (HEIGHT - 12) }))
    : [];

  return (
    <View>
      <View style={styles.scaleRow}>
        <Text style={[styles.scale, { color: palette.accentStrong }]}>{primaryMax > 0 ? formatPrimary(primaryMax) : ''}</Text>
        {secondary && formatSecondary && secondaryMax > 0 ? <Text style={[styles.scale, { color: palette.record }]}>{formatSecondary(secondaryMax)}</Text> : null}
      </View>
      <View onLayout={(event) => setWidth(Math.max(120, event.nativeEvent.layout.width))} style={[styles.plot, { height: HEIGHT, borderBottomColor: palette.border }]}>
        <View style={[styles.gridLine, { top: 0, backgroundColor: palette.border }]} />
        <View style={[styles.gridLine, { top: HEIGHT / 2, backgroundColor: palette.border }]} />
        <View style={styles.bars}>
          {values.map((value, index) => {
            const height = value && primaryMax > 0 ? Math.max(3, ((value - base) / (primaryMax - base)) * (HEIGHT - 8)) : 0;
            const active = selected === index;
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={accessibilityLabel(index)}
                onPress={() => onSelect(index)}
                style={[styles.slot, active && { backgroundColor: palette.accentSoft }]}
              >
                <View style={[styles.bar, { height, backgroundColor: active || selected == null ? palette.accent : palette.accentStrong, opacity: active || selected == null ? 1 : 0.55 }]} />
              </Pressable>
            );
          })}
        </View>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {linePoints.map((point, index) => {
            const previous = index > 0 ? linePoints[index - 1] : null;
            if (!point || !previous) return null;
            const dx = point.x - previous.x;
            const dy = point.y - previous.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            return <View key={`segment-${index}`} style={[styles.segment, { width: length, left: (previous.x + point.x - length) / 2, top: (previous.y + point.y) / 2 - 1, backgroundColor: palette.record, transform: [{ rotate: `${angle}deg` }] }]} />;
          })}
          {linePoints.map((point, index) => (point ? <View key={`point-${index}`} style={[styles.point, { left: point.x - 3.5, top: point.y - 3.5, backgroundColor: palette.surface, borderColor: palette.record }]} /> : null))}
        </View>
      </View>
      <View style={styles.labels}>
        {labels.map((label, index) => (
          <Text key={index} numberOfLines={1} style={[styles.label, { width: slot * labelEvery, left: slot * index + slot / 2 - (slot * labelEvery) / 2, color: palette.textMuted }]}>
            {index % labelEvery === (labels.length - 1) % labelEvery ? label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 16 },
  scale: { fontSize: 11, fontWeight: '700' },
  plot: { position: 'relative', borderBottomWidth: StyleSheet.hairlineWidth },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, opacity: 0.6 },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', borderRadius: 4 },
  bar: { width: '70%', maxWidth: 26, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  segment: { position: 'absolute', height: 2 },
  point: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, borderWidth: 2 },
  labels: { position: 'relative', height: 18, marginTop: 4 },
  label: { position: 'absolute', fontSize: 10, textAlign: 'center' },
});
