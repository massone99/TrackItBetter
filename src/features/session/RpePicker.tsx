import { useTranslation } from 'react-i18next';
import { useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { formatRpe, RPE_VALUES } from '../../domain/rpe';
import { Icon, Label, tapFeedback, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/**
 * RPE chips from 6 to 10. `inline` is the one-line strip shown under a just-completed set;
 * otherwise it wraps, for sheets.
 */
export function RpePicker({ value, onChange, inline = false, compact = false, onDismiss, sideLabel = '' }: {
  sideLabel?: string;
  /** The always-visible second row of a set in the workout: small chips, no dismiss. */
  compact?: boolean;
  value: number | null;
  onChange: (value: number | null) => void;
  inline?: boolean;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const chips = RPE_VALUES.map((rpe) => {
    const selected = value === rpe;
    return (
      <Pressable
        key={rpe}
        accessibilityRole="button"
        accessibilityLabel={`${sideLabel} ${t('logger.rpeTag', { value: formatRpe(rpe) })}`.trim()}
        accessibilityState={{ selected }}
        hitSlop={compact ? { top: 6, bottom: 6, left: 4, right: 4 } : 6}
        onPress={() => { tapFeedback(); onChange(selected ? null : rpe); }}
        style={[compact ? styles.compactChip : inline ? styles.stripChip : styles.chip, { backgroundColor: selected ? palette.accent : compact ? 'transparent' : palette.surface, borderColor: selected ? palette.accent : palette.border }]}
      >
        <Text style={[compact ? styles.compactChipText : styles.chipText, { color: selected ? palette.accentText : palette.text }]}>{formatRpe(rpe)}</Text>
      </Pressable>
    );
  });

  if (compact) {
    return <CompactRpe value={value} sideLabel={sideLabel} chips={chips} />;
  }

  if (!inline) {
    return (
      <View style={styles.block}>
        <Label>{t('logger.rpeLabel')}</Label>
        <View style={styles.wrap}>{chips}</View>
        <Text style={[styles.hint, { color: palette.textMuted }]}>{t('logger.rpeHint')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.strip}>
      <Text style={[styles.stripLabel, { color: palette.textMuted }]}>{t('logger.rpe')}</Text>
      <ScrollView horizontal style={styles.scroll} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
        {chips}
      </ScrollView>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('logger.rpeSkip')} hitSlop={8} onPress={onDismiss} style={styles.dismiss}>
          <Icon name="close" size={16} color={palette.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Width of one compact chip plus the gap after it, so the strip can scroll to a value. */
const COMPACT_STEP = 40 + 8;

/**
 * The RPE row of a set: a fixed strip that shows about five values and a sliver of the next (a cue
 * that it scrolls sideways). It opens on the chosen value, or around 7–8 (where most working sets
 * land), so the likely values are in view.
 */
function CompactRpe({ value, sideLabel, chips }: { value: number | null; sideLabel: string; chips: ReactNode[] }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const scroll = useRef<ScrollView>(null);
  const focus = Math.max(0, (RPE_VALUES as readonly number[]).indexOf(value ?? 7) - 1);
  return (
    <View style={styles.compactRow}>
      {/* Same width as the set number column, so "RPE" sits right under the set number. */}
      <View style={styles.compactLabel}>
        <Text accessibilityLabel={`${t('logger.rpe')} ${sideLabel}`.trim()} style={[styles.stripLabel, { color: palette.textMuted }]}>{t('logger.rpe')}</Text>
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        style={styles.compactStrip}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.compactChips}
        onLayout={() => scroll.current?.scrollTo({ x: focus * COMPACT_STEP, animated: false })}
      >
        {chips}
      </ScrollView>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  block: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 40, paddingRight: 4, paddingBottom: 10 },
  stripLabel: { fontFamily: fonts.semibold, fontSize: 12 },
  scroll: { flex: 1 },
  row: { gap: 4, paddingRight: 4 },
  stripChip: { minWidth: 44, minHeight: 48, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { minWidth: 48, minHeight: 48, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.display, fontSize: 20 },
  compactRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2, paddingTop: 4, paddingBottom: 12 },
  // Spans the reps and kg columns; the done and menu columns (44 + 32) stay clear.
  compactStrip: { flex: 1, marginRight: 76 },
  compactLabel: { width: 40, alignItems: 'center' },
  compactChips: { gap: 8, paddingRight: 8 },
  compactChip: { width: 40, minHeight: 36, paddingHorizontal: 0, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  compactChipText: { fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
  dismiss: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
});
