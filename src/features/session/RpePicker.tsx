import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { formatRpe, RPE_VALUES } from '../../domain/rpe';
import { Icon, Label, tapFeedback, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

// The quick strip drops 6.5 so the whole scale fits on one line; the sheet offers every value.
const STRIP_VALUES = RPE_VALUES.filter((rpe) => rpe !== 6.5);

/**
 * RPE chips from 6 to 10. `inline` is the one-line strip shown under a just-completed set;
 * otherwise it wraps, for sheets.
 */
export function RpePicker({ value, onChange, inline = false, onDismiss }: {
  value: number | null;
  onChange: (value: number | null) => void;
  inline?: boolean;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const chips = (inline ? STRIP_VALUES : RPE_VALUES).map((rpe) => {
    const selected = value === rpe;
    return (
      <Pressable
        key={rpe}
        accessibilityRole="button"
        accessibilityLabel={t('logger.rpeTag', { value: formatRpe(rpe) })}
        accessibilityState={{ selected }}
        hitSlop={6}
        onPress={() => { tapFeedback(); onChange(selected ? null : rpe); }}
        style={[inline ? styles.stripChip : styles.chip, { backgroundColor: selected ? palette.accent : palette.surface, borderColor: selected ? palette.accent : palette.border }]}
      >
        <Text style={[styles.chipText, { color: selected ? palette.accentText : palette.text }]}>{formatRpe(rpe)}</Text>
      </Pressable>
    );
  });

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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
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
  row: { gap: 4, paddingRight: 4 },
  stripChip: { minWidth: 30, height: 32, paddingHorizontal: 5, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { minWidth: 36, height: 32, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.display, fontSize: 16 },
  dismiss: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
