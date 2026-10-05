import { Pressable, StyleSheet } from 'react-native';
import { Icon, useRepeatPress } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';

/** Step of the load buttons: the smallest common plate pair. */
export const LOAD_STEP_KG = 1.25;

/** Added (or assisted, negative) load with its sign and unit: "+10 kg", "−5 kg". */
export function formatLoad(kg: number): string {
  return `${kg > 0 ? '+' : '−'}${formatNumber(Math.abs(kg))} kg`;
}

/** The load as shown in a set row's kg column: "0", "+10", "−5". */
export function loadCell(kg: number): string {
  return kg === 0 ? '0' : formatLoad(kg).replace(' kg', '');
}

/** Tap to step once, hold to repeat (faster after a moment). */
export function StepButton({ icon, label, onPress }: { icon: 'add' | 'remove'; label: string; onPress: (multiplier: number) => void }) {
  const styles = useScaledStyles(setEntryStyles);
  const { palette } = useTheme();
  const handlers = useRepeatPress(onPress);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // 28 dp button + 10 dp on each side = the 48 dp touch target.
      hitSlop={10}
      {...handlers}
      style={({ pressed }) => [styles.stepButton, { backgroundColor: palette.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={16} color={palette.text} />
    </Pressable>
  );
}

/**
 * The grid of a set row, shared by the workout logger and the micro-session so both read the same:
 * set number · value stepper · kg stepper · done · menu, with the RPE strip on a second line.
 */
export const setEntryStyles = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingTop: 4, paddingLeft: 2 },
  colSet: { width: 40 },
  colValue: { flex: 1 },
  colLoad: { flex: 1 },
  colHeader: { textAlign: 'center' },
  colAction: { width: 44, alignItems: 'center' },
  colMenu: { width: 32, alignItems: 'center' },
  badge: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.display, fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  value: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
  loadValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stepButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  checkButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
