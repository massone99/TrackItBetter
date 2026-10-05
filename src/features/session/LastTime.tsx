import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LastTimeComparison, Pairing } from '../../domain/lastTime';
import { Icon, Label, tapFeedback, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';

/**
 * This session against the last one, as three small cells (total, rest, form). A beaten cell turns
 * green with an arrow; a tap shows last time's sets underneath.
 */
export function LastTimeStrip({ comparison, unit, detail }: {
  comparison: LastTimeComparison;
  /** Unit of the total: "reps", "s" or "m". */
  unit: string;
  /** Last time's date and sets, shown on demand. */
  detail: string;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [open, setOpen] = useState(false);
  const cells: { key: string; label: string; pairing: Pairing; improved: boolean; format: (value: number | null) => string; spoken: string }[] = [];
  const dash = (format: (value: number) => string) => (value: number | null) => (value === null ? '–' : format(value));
  const { total, rest, form, improved } = comparison;
  if (total) cells.push({ key: 'total', label: t('lastTime.total'), pairing: total, improved: improved.total, format: dash((value) => formatNumber(value)), spoken: t('lastTime.totalSpoken', { now: formatNumber(total.now ?? 0), last: formatNumber(total.last), unit }) });
  if (rest) cells.push({ key: 'rest', label: t('lastTime.rest'), pairing: rest, improved: improved.rest, format: dash((value) => `${value} s`), spoken: t('lastTime.restSpoken', { now: rest.now ?? '–', last: rest.last }) });
  if (form) cells.push({ key: 'form', label: t('lastTime.form'), pairing: form, improved: improved.form, format: dash((value) => String(value)), spoken: t('lastTime.formSpoken', { now: form.now ?? '–', last: form.last }) });
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={t('lastTime.hint')}
        onPress={() => { tapFeedback(); setOpen((current) => !current); }}
        style={({ pressed }) => [styles.strip, { opacity: pressed ? 0.75 : 1 }]}
      >
        {cells.map((cell) => {
          const color = cell.improved ? palette.success : palette.text;
          return (
            <View
              key={cell.key}
              accessible
              accessibilityLabel={`${cell.spoken}${cell.improved ? `, ${t('lastTime.better')}` : ''}`}
              style={[styles.cell, { borderColor: cell.improved ? palette.success : palette.border, backgroundColor: cell.improved ? palette.successSoft : 'transparent' }]}
            >
              <Text style={[styles.cellLabel, { color: palette.textMuted }]}>{cell.label}</Text>
              <View style={styles.values}>
                <Text style={[styles.now, { color }]}>{cell.format(cell.pairing.now)}</Text>
                <Text style={[styles.last, { color: palette.textMuted }]}>{`/ ${cell.format(cell.pairing.last)}`}</Text>
                {cell.improved ? <Icon name="arrow-up" size={14} color={palette.success} /> : null}
              </View>
            </View>
          );
        })}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={palette.textMuted} />
      </Pressable>
      {open ? <Label style={styles.detail}>{detail}</Label> : null}
    </View>
  );
}

/** The "how clean was it" rating, 1–5, in the same chip style as the RPE row; tap the chosen one again to clear. */
export function FormRating({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={styles.formRow}>
      <View style={styles.formLabel}><Text style={[styles.formLabelText, { color: palette.textMuted }]}>{t('lastTime.form')}</Text></View>
      <View style={styles.formChips}>
        {[1, 2, 3, 4, 5].map((rating) => {
          const selected = value === rating;
          return (
            <Pressable
              key={rating}
              accessibilityRole="button"
              accessibilityLabel={t('lastTime.formRating', { value: rating })}
              accessibilityState={{ selected }}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              onPress={() => { tapFeedback(); onChange(selected ? null : rating); }}
              style={[styles.chip, { backgroundColor: selected ? palette.accent : 'transparent', borderColor: selected ? palette.accent : palette.border }]}
            >
              <Text style={[styles.chipText, { color: selected ? palette.accentText : palette.text }]}>{rating}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 6 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cell: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, gap: 2 },
  cellLabel: { fontFamily: fonts.medium, fontSize: 12 },
  values: { flexDirection: 'row', alignItems: 'baseline', gap: 3, flexWrap: 'wrap' },
  now: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22, fontVariant: ['tabular-nums'] },
  last: { fontFamily: fonts.medium, fontSize: 12, fontVariant: ['tabular-nums'] },
  detail: { marginTop: 2 },
  formRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2, paddingTop: 4, paddingBottom: 8 },
  formLabel: { width: 40, alignItems: 'center' },
  formLabelText: { fontFamily: fonts.semibold, fontSize: 12 },
  formChips: { flexDirection: 'row', gap: 8 },
  chip: { width: 40, minHeight: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
});
