import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/components/Text';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import type { StatsBar } from './trainingStats';

const CHART_HEIGHT = 56;
const MIN_COLUMNS = 8;

/** Working sets per period, one hue; tapping a column selects that period. */
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
  const max = Math.max(1, ...bars.map((bar) => bar.sets));
  const placeholders = Math.max(0, MIN_COLUMNS - bars.length);
  return <View>
    <View style={styles.bars}>
      {Array.from({ length: placeholders }).map((_, index) => <View key={`placeholder-${index}`} style={styles.column} />)}
      {bars.map((bar) => {
        const selected = bar.id === selectedId;
        const height = bar.sets === 0 ? 2 : Math.max(4, Math.round((bar.sets / max) * CHART_HEIGHT));
        return <Pressable key={bar.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={describe(bar)} hitSlop={4} onPress={() => onSelect(bar.id)} style={styles.column}>
          <View style={[styles.bar, { height, backgroundColor: bar.sets === 0 ? (selected ? palette.accentStrong : palette.border) : selected ? palette.accentStrong : palette.accentSoft }]} />
        </Pressable>;
      })}
    </View>
    <View style={[styles.baseline, { backgroundColor: palette.border }]} />
    <View style={styles.labels}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{firstLabel}</Text>
      <Text style={[styles.label, { color: palette.textMuted }]}>{lastLabel}</Text>
    </View>
  </View>;
}

const baseStyles = StyleSheet.create({
  bars: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  baseline: { height: StyleSheet.hairlineWidth },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  label: { fontSize: 12 },
});
