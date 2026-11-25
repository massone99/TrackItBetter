import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { MIN_TOUCH_TARGET } from '../../../shared/theme/tokens';
import { cappedTextGrowth, MIN_FONT_SIZE } from '../../../shared/theme/scale';

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
  /** Two series for an exercise's L/R comparison. Both use the same scale. */
  comparison?: {
    left: readonly (number | null)[];
    right: readonly (number | null)[];
  };
  /** Keep comparison lines and bars on one shared value scale. */
  sharedScale?: boolean;
}

const HEIGHT = 170;
const LABEL_COUNT = 5;

/** Bars for one metric with an optional line for a second one; tap a bar to select its period. */
export function StatsChart({ values, secondary, labels, selected, onSelect, formatPrimary, zeroBased = true, formatSecondary, accessibilityLabel, comparison, sharedScale = false }: StatsChartProps) {
  const styles = useScaledStyles(baseStyles);
  const { palette, layoutScale, fontScale } = useTheme();
  // Visible width; the plot is at least one 48 dp touch target per period wide and scrolls sideways
  // when that is wider than the screen, starting at the latest periods (the end).
  const [viewport, setViewport] = useState(300);
  const scroll = useRef<ScrollView>(null);
  const width = Math.max(viewport, values.length * MIN_TOUCH_TARGET);
  const scrolls = width > viewport + 0.5;
  const present = values.filter((value): value is number => value != null && value > 0);
  const primaryMax = Math.max(0, ...present);
  const primaryMin = present.length ? Math.min(...present) : 0;
  const comparisonPresent = comparison
    ? [...comparison.left, ...comparison.right].filter((value): value is number => value != null && value > 0)
    : [];
  const chartMax = sharedScale ? Math.max(primaryMax, ...comparisonPresent) : primaryMax;
  const chartMin = sharedScale && comparisonPresent.length ? Math.min(primaryMin || Infinity, ...comparisonPresent) : primaryMin;
  const base = zeroBased || !present.length ? 0 : Math.max(0, chartMin - (chartMax - chartMin || chartMax) * 0.5);
  const secondaryPresent = (secondary ?? []).filter((value): value is number => value != null);
  const secondaryMax = secondaryPresent.length ? Math.max(...secondaryPresent) : 0;
  const slot = width / Math.max(1, values.length);
  // Room one date label ("Nov 23", 12 dp text at the least) needs, so labels never cut each other or the edge.
  const labelText = Math.max(MIN_FONT_SIZE, 12 * layoutScale) * cappedTextGrowth(12 * layoutScale, fontScale, layoutScale);
  const labelRoom = labelText * 3.6 + 8;
  const labelEvery = Math.max(1, Math.ceil(values.length / LABEL_COUNT), Math.ceil(labelRoom / slot));

  const pointsFor = (line: readonly (number | null)[], max: number) => max > 0
    ? line.map((value, index) => (value == null ? null : { x: slot * index + slot / 2, y: HEIGHT - 4 - (value / max) * (HEIGHT - 12) }))
    : [];
  const linePoints = pointsFor(secondary ?? [], sharedScale ? chartMax : secondaryMax);
  const leftPoints = comparison ? pointsFor(comparison.left, chartMax) : [];
  const rightPoints = comparison ? pointsFor(comparison.right, chartMax) : [];

  const line = (points: readonly ({ x: number; y: number } | null)[], color: string, keyPrefix: string) => (
    <>
      {points.map((point, index) => {
        const previous = index > 0 ? points[index - 1] : null;
        if (!point || !previous) return null;
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return <View key={`${keyPrefix}-segment-${index}`} style={[styles.segment, { width: length, left: (previous.x + point.x - length) / 2, top: (previous.y + point.y) / 2 - 1, backgroundColor: color, transform: [{ rotate: `${angle}deg` }] }]} />;
      })}
      {points.map((point, index) => (point ? <View key={`${keyPrefix}-point-${index}`} style={[styles.point, { left: point.x - 3.5, top: point.y - 3.5, backgroundColor: palette.surface, borderColor: color }]} /> : null))}
    </>
  );

  return (
    <View>
      <View style={styles.scaleRow}>
        <Text style={[styles.scale, { color: palette.accentStrong }]}>{chartMax > 0 ? formatPrimary(chartMax) : ''}</Text>
        {secondary && formatSecondary && secondaryMax > 0 && !sharedScale ? <Text style={[styles.scale, { color: palette.record }]}>{formatSecondary(secondaryMax)}</Text> : null}
      </View>
      <View onLayout={(event) => setViewport(Math.max(120, event.nativeEvent.layout.width))}>
        <ScrollView
          ref={scroll}
          horizontal
          scrollEnabled={scrolls}
          showsHorizontalScrollIndicator={scrolls}
          onContentSizeChange={() => { if (scrolls) scroll.current?.scrollToEnd({ animated: false }); }}
        >
          <View>
            <View style={[styles.plot, { width, height: HEIGHT, borderBottomColor: palette.border }]}>
              <View style={[styles.gridLine, { top: 0, backgroundColor: palette.border }]} />
              <View style={[styles.gridLine, { top: HEIGHT / 2, backgroundColor: palette.border }]} />
              <View style={styles.bars}>
                {values.map((value, index) => {
                  const height = value && chartMax > 0 && !comparison ? Math.max(3, ((value - base) / (chartMax - base)) * (HEIGHT - 8)) : 0;
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
                {comparison ? line(leftPoints, palette.record, 'left') : line(linePoints, palette.record, 'secondary')}
                {comparison ? line(rightPoints, palette.accentStrong, 'right') : null}
              </View>
            </View>
            <View style={[styles.labels, { width }]}>
              {/* Invisible line in the flow: the row is as tall as one label at any interface and text size. */}
              <Text accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.label, styles.labelSpacer]}>0</Text>
              {labels.map((label, index) => {
                if (index % labelEvery !== (labels.length - 1) % labelEvery) return null;
                // Each label is centred under its period; at the two ends its box is cut at the plot's edge
                // and the text aligned to it, so labels stay inside the plot and never overlap.
                const center = slot * index + slot / 2;
                const half = (slot * labelEvery) / 2;
                // The latest period always gets its label: widened to the left, where the previous label is a full step away.
                const left = index === labels.length - 1 ? Math.max(0, Math.min(center - half, width - labelRoom)) : Math.max(0, center - half);
                const right = Math.min(width, center + half);
                const align = center - half < 0 ? 'left' : center + half > width ? 'right' : 'center';
                // An end label whose box the plot edge cut too short would lose its first or last characters.
                if (right - left < labelRoom && index !== labels.length - 1) return null;
                return (
                  <Text key={index} numberOfLines={1} style={[styles.label, { width: right - left, left, textAlign: align, color: palette.textMuted }]}>
                    {label}
                  </Text>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 16 },
  scale: { fontSize: 12, fontWeight: '700' },
  plot: { position: 'relative', borderBottomWidth: StyleSheet.hairlineWidth },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, opacity: 0.6 },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', borderRadius: 4 },
  bar: { width: '70%', maxWidth: 26, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  segment: { position: 'absolute', height: 2 },
  point: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, borderWidth: 2 },
  labels: { position: 'relative', marginTop: 4 },
  labelSpacer: { position: 'relative', opacity: 0 },
  label: { position: 'absolute', fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
