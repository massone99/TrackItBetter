import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gauge, gaugeMax } from './instrument';
import { Icon, Tag, Text } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, MIN_TOUCH_TARGET, spacing } from '../../shared/theme/tokens';

/** "Previous matching set": what the same set was last time, with its RPE on the right. */
export function PreviousSetBox({ label, value, rpeLabel, rpeValue, sideLabel }: { label: string; value: string; rpeLabel: string | null; rpeValue: string | null; sideLabel: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <View style={[styles.prev, { borderColor: ink, backgroundColor: palette.surface }]} accessible accessibilityLabel={`${label}. ${value}${rpeValue ? `. ${rpeLabel} ${rpeValue}` : ''}`}>
      <View style={styles.prevMain}>
        <Tag>{label}</Tag>
        <Text style={[styles.prevValue, { color: palette.text }]}>{value}</Text>
      </View>
      {rpeValue ? (
        <View style={styles.prevSide}>
          <Text style={[styles.reference, { color: palette.textMuted }]}>{`${rpeLabel} `}<Text style={[styles.prevRpe, { color: palette.accentStrong }]}>{rpeValue}</Text></Text>
          <Text style={[styles.reference, { color: palette.textMuted }]}>{sideLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** One measured quantity in its own box: a centred title, the stepper, and what the figure is. */
export function MeasureBox({ label, caption, stack, children }: { label: string; caption: string; stack: boolean; children: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <View style={[styles.measure, stack && styles.measureStack, { borderColor: ink, backgroundColor: palette.surface }]}>
      <Text style={[styles.measureLabel, { color: palette.textMuted }]}>{label}</Text>
      {children}
      <Text style={[styles.measureCaption, { color: palette.textMuted }]}>{caption}</Text>
    </View>
  );
}

/** "Work output": the figure against last time's on a graduated scale, with its maximum below. */
export function WorkOutput({ title, current, reference, referenceLabel, value, ghost, scale, color }: { title: string; current: string; reference: string | null; referenceLabel: string; value: number; ghost: number | null; scale: string; color: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={styles.work} accessible accessibilityLabel={`${title} ${current}${reference ? `. ${referenceLabel} ${reference}` : ''}`}>
      <View style={styles.workRow}>
        <Text style={[styles.workText, { color: palette.textMuted }]}>{`${title} / ${current}`}</Text>
        {reference ? <Text style={[styles.workText, { color: palette.textMuted }]}>{`${referenceLabel} `}<Text style={{ color: palette.record }}>{reference}</Text></Text> : null}
      </View>
      <Gauge value={value} ghost={ghost} color={color} />
      <View style={styles.workRow}>
        <Text style={[styles.workText, { color: palette.textMuted }]}>0</Text>
        <Text style={[styles.workText, { color: palette.textMuted }]}>{scale}</Text>
      </View>
    </View>
  );
}

export { gaugeMax };

/** One segment per set: done, the one in hand, the rest. */
export function SetSegments({ states }: { states: ('done' | 'current' | 'todo')[] }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {states.map((state, index) => (
        <View key={index} style={[styles.segment, { backgroundColor: state === 'done' ? palette.success : state === 'current' ? palette.accentStrong : palette.border }]} />
      ))}
    </View>
  );
}

/** "Additional metadata · 1/4" with its open/close word; the chips below it are the rest, side, note and clips. */
export function DetailsToggle({ label, count, open, actionLabel, onPress }: { label: string; count: string; open: boolean; actionLabel: string; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${count}. ${actionLabel}`} accessibilityState={{ expanded: open }} onPress={onPress} style={({ pressed }) => [styles.details, { borderColor: ink }, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.workText, styles.detailsText, { color: palette.textMuted }]}>{`${label} · ${count}`}</Text>
      <Text style={[styles.workText, { color: palette.accentStrong }]}>{actionLabel}</Text>
    </Pressable>
  );
}

export interface RatingCell {
  id: 'rpe' | 'form' | 'rom';
  label: string;
  /** "8", "3.5"; null shows a dash, never a zero. */
  value: string | null;
  /** Small line under the value, e.g. the target RPE. */
  hint?: string;
  open: boolean;
  onPress: () => void;
}

/** RPE, form and ROM side by side; a tap opens that picker below, one at a time. Always shows a value or a dash. */
export function RatingCells({ title, counter, cells }: { title: string; counter: string; cells: RatingCell[] }) {
  const styles = useScaledStyles(baseStyles);
  const { palette, largeText } = useTheme();
  const ink = useInk();
  return (
    <View style={styles.ratings}>
    <View style={styles.ratingsHead}>
      <Tag>{title}</Tag>
      <Text style={[styles.workText, { color: palette.textMuted }]}>{counter}</Text>
    </View>
    <View style={[styles.cells, !largeText && styles.cellsRow]}>
      {cells.map((cell) => (
        <Pressable
          key={cell.id}
          accessibilityRole="button"
          accessibilityLabel={`${cell.label} ${cell.value ?? '—'}`}
          accessibilityState={{ expanded: cell.open }}
          onPress={cell.onPress}
          style={({ pressed }) => [styles.cell, largeText && styles.cellLarge, { borderColor: cell.open ? palette.accentStrong : ink, backgroundColor: cell.open ? palette.accentSoft : palette.surface }, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.cellHead}>
            <Text style={[styles.cellLabel, { color: palette.textMuted }]}>{cell.label}</Text>
            <Icon name="create-outline" size={14} color={palette.textMuted} />
          </View>
          <Text style={[styles.cellValue, { color: cell.value === null ? palette.textMuted : palette.text }]}>{cell.value ?? '—'}</Text>
          {cell.hint ? <Text style={[styles.cellHint, { color: palette.textMuted }]}>{cell.hint}</Text> : null}
        </Pressable>
      ))}
    </View>
    </View>
  );
}

/** Band section of the set in hand: the estimated assistance as a big figure, and the chosen bands with their editor button. */
export function BandsStrip({ title, tag, assistLabel, assistValue, assistUnit, assistFoot, text, colors, open, actionLabel, onPress }: { title: string; tag: string; assistLabel: string; assistValue: string; assistUnit: string | null; assistFoot: string; text: string; colors: string[]; open: boolean; actionLabel: string; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <View style={[styles.bands, { borderColor: ink, backgroundColor: palette.surface }]}>
      <View style={styles.bandsTop}>
        <Text style={[styles.workText, styles.detailsText, { color: palette.textMuted }]}>{title}</Text>
        <View style={[styles.bandsTag, { borderColor: palette.accentStrong }]}><Text style={[styles.workText, { color: palette.accentStrong }]}>{tag}</Text></View>
      </View>
      <View style={styles.bandsBody}>
        <View style={styles.assist} accessible accessibilityLabel={`${assistLabel} ${assistValue} ${assistUnit ?? ''}. ${assistFoot}`}>
          <Text style={[styles.workText, { color: palette.textMuted }]}>{assistLabel}</Text>
          <View style={styles.assistFigure}>
            <Text style={[styles.assistValue, { color: palette.text }]}>{assistValue}</Text>
            {assistUnit ? <Text style={[styles.assistUnit, { color: palette.textMuted }]}>{assistUnit}</Text> : null}
          </View>
          <Text style={[styles.workText, { color: palette.textMuted }]}>{assistFoot}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{ expanded: open }} onPress={onPress} style={({ pressed }) => [styles.bandCard, { borderColor: ink, backgroundColor: palette.surfaceMuted }, pressed && { opacity: 0.6 }]}>
          <View style={styles.swatchRow}>
            {colors.map((color, index) => <View key={`${color}-${index}`} style={[styles.swatch, { backgroundColor: color, borderColor: palette.border }]} />)}
            <Text style={[styles.bandName, { color: palette.text }]}>{text}</Text>
          </View>
          <Text style={[styles.workText, { color: palette.accentStrong }]}>{`${actionLabel} ${open ? '↑' : '↓'}`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  reference: { fontSize: 13 },
  prev: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderWidth: 1, borderRadius: instrument.radius, padding: spacing.md, marginVertical: spacing.sm },
  prevMain: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: spacing.xs },
  prevValue: { fontSize: 16, fontWeight: '700' },
  prevSide: { alignItems: 'flex-end', gap: spacing.xs },
  prevRpe: { fontWeight: '700' },
  measure: { flexGrow: 1, flexBasis: 0, minWidth: 128, borderWidth: 1, borderRadius: instrument.radius, padding: spacing.sm, gap: spacing.sm, alignItems: 'stretch' },
  measureStack: { flexBasis: '100%', minWidth: '100%' },
  measureLabel: { fontSize: 12, textAlign: 'center', letterSpacing: 1 },
  measureCaption: { fontSize: 12, textAlign: 'center' },
  work: { gap: spacing.xs, paddingVertical: spacing.sm },
  workRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
  workText: { fontSize: 12, letterSpacing: 0.5 },
  segments: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.sm },
  segment: { flex: 1, height: 4 },
  details: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingVertical: spacing.sm, borderTopWidth: 1 },
  detailsText: { flexShrink: 1 },
  ratings: { gap: spacing.xs, paddingTop: spacing.sm },
  ratingsHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  cellsRow: { flexWrap: 'nowrap' },
  cell: { flexGrow: 1, flexBasis: 0, minWidth: 0, minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderRadius: instrument.radius, padding: spacing.sm, gap: spacing.xs },
  cellLarge: { flexBasis: 120, minWidth: 120 },
  cellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  cellLabel: { fontSize: 12, letterSpacing: 0.5 },
  cellValue: { fontSize: 24, fontWeight: '700' },
  cellHint: { fontSize: 12 },
  bands: { borderWidth: 1, borderRadius: instrument.radius, marginVertical: spacing.sm },
  bandsTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.sm },
  bandsTag: { borderWidth: 1, borderRadius: instrument.radius, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  bandsBody: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.sm },
  assist: { flexGrow: 1, flexBasis: 120, minWidth: 0, gap: spacing.xs },
  assistFigure: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  assistValue: { fontSize: 36, fontWeight: '700' },
  assistUnit: { fontSize: 14 },
  bandCard: { flexGrow: 1, flexBasis: 150, minWidth: 0, minHeight: MIN_TOUCH_TARGET, justifyContent: 'space-between', gap: spacing.sm, borderWidth: 1, borderRadius: instrument.radius, padding: spacing.sm },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 14, height: 14, borderWidth: 1, borderRadius: instrument.radius },
  bandName: { fontSize: 15, fontWeight: '700' },
});
