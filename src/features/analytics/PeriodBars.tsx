import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/components/Text';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { MIN_TOUCH_TARGET } from '../../shared/theme/tokens';
import type { StatsBar } from './trainingStats';

const CHART_HEIGHT = 56;
const MIN_COLUMNS = 8;

/**
 * Working sets per period, one hue; tapping a column selects that period. Every column is a 48 dp
 * touch target: when they do not all fit, the row scrolls sideways and starts at the latest period.
 */
export function PeriodBars({ bars, selectedId, onSelect, describe, firstLabel, lastLabel }: {
  bars: StatsBar[];
  selectedId: string;
  onSelect: (id: string) => void;
  describe: (bar: StatsBar) => string;
  firstLabel: string;
  lastLabel: string;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const scroll = useRef<ScrollView>(null);
  // The chart follows the interface size, so bar heights are a share of the drawn height.
  const chartHeight = styles.bars.height;
  const max = Math.max(1, ...bars.map((bar) => bar.sets));
  const placeholders = Math.max(0, MIN_COLUMNS - bars.length);
  return <View>
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
    >
      <View style={styles.bars}>
        {Array.from({ length: placeholders }).map((_, index) => <View key={`placeholder-${index}`} style={styles.column} />)}
        {bars.map((bar) => {
          const selected = bar.id === selectedId;
          const height = bar.sets === 0 ? 2 : Math.max(4, Math.round((bar.sets / max) * chartHeight));
          return <Pressable key={bar.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={describe(bar)} onPress={() => onSelect(bar.id)} style={styles.column}>
            <View style={[styles.bar, { height, backgroundColor: bar.sets === 0 ? (selected ? palette.accentStrong : palette.border) : selected ? palette.accentStrong : palette.accentSoft }]} />
          </Pressable>;
        })}
      </View>
    </ScrollView>
    <View style={[styles.baseline, { backgroundColor: palette.border }]} />
    <View style={styles.labels}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{firstLabel}</Text>
      <Text style={[styles.label, { color: palette.textMuted }]}>{lastLabel}</Text>
    </View>
  </View>;
}

const baseStyles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  bars: { flexGrow: 1, height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  column: { flexGrow: 1, flexBasis: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, height: '100%', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  baseline: { height: StyleSheet.hairlineWidth },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  label: { fontSize: 12 },
});
