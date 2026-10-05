import { useTranslation } from 'react-i18next';
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
        hitSlop={compact ? { top: 8, bottom: 8, left: 2, right: 2 } : 6}
        onPress={() => { tapFeedback(); onChange(selected ? null : rpe); }}
        style={[compact ? styles.compactChip : inline ? styles.stripChip : styles.chip, { backgroundColor: selected ? palette.accent : palette.surface, borderColor: selected ? palette.accent : palette.border }]}
      >
        <Text style={[compact ? styles.compactChipText : styles.chipText, { color: selected ? palette.accentText : compact ? palette.textMuted : palette.text }]}>{formatRpe(rpe)}</Text>
      </Pressable>
    );
  });

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <Text style={[styles.stripLabel, { color: palette.textMuted }]}>{t('logger.rpe')}</Text>
        {/* The nine values share the width, so all of them are visible without scrolling. */}
        <View style={styles.compactChips}>{chips}</View>
      </View>
    );
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
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 40, paddingBottom: 8 },
  compactChips: { flex: 1, flexDirection: 'row', gap: 3 },
  compactChip: { flex: 1, minHeight: 32, paddingHorizontal: 0, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  compactChipText: { fontFamily: fonts.semibold, fontSize: 13 },
  dismiss: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
});
