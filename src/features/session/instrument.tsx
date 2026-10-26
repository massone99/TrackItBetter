import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { DotGrid, RegistrationMarks, Tag } from '../../shared/components/ui';
import { useAnimationSettings } from '../../shared/settings/AnimationProvider';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument } from '../../shared/theme/tokens';

/**
 * Pieces of the "instrument" look of the workout: thin ink lines, square corners, mono figures, a dot-grid
 * ground, bar gauges and registration marks. The colours all come from the palette.
 */

export { useInk };

export { DotGrid, RegistrationMarks, Tag };

/** Where a value sits on its scale: a "nice" maximum above both the value and last time's. */
export function gaugeMax(value: number, ghost: number | null): number {
  const top = Math.max(value, ghost ?? 0, 1) * 1.4;
  const step = top <= 12 ? 2 : top <= 30 ? 5 : top <= 120 ? 10 : 60;
  return Math.max(10, Math.ceil(top / step) * step);
}

/**
 * A graduated bar: the fill is the value of the set, the marker is last time's value. The fill grows when
 * it appears, unless animations are off.
 */
export function Gauge({ value, ghost, color, delay = 0 }: { value: number; ghost: number | null; color: string; delay?: number }) {
  const { palette } = useTheme();
  const { duration } = useAnimationSettings();
  const max = gaugeMax(value, ghost);
  const target = Math.min(1, Math.max(0, value / max));
  const progress = useSharedValue(0);
  const growth = duration(600);
  useEffect(() => {
    progress.value = growth > 0 ? withDelay(delay, withTiming(target, { duration: growth })) : target;
  }, [target, growth, delay, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View
      testID="set-gauge"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.gauge, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tick) => <View key={tick} style={[styles.tick, { left: `${tick * 10}%`, backgroundColor: palette.border }]} />)}
      <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
      {ghost !== null ? <View style={[styles.ghost, { left: `${Math.min(100, Math.max(0, (ghost / max) * 100))}%`, backgroundColor: palette.record }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gauge: { height: instrument.gauge, borderWidth: instrument.line, justifyContent: 'center' },
  tick: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  ghost: { position: 'absolute', top: -4, bottom: -4, width: 2 },
});
