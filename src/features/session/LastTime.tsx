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
 * This session against the last one: a title line ("Vs last time · Sat 3 Oct", with a button that shows
 * last time's sets) and one cell per measure, each reading "8 today" over "last time 26". A beaten
 * value turns green with ↑ and the gain; a lower average form turns red with ↓.
 */
export function LastTimeStrip({ comparison, metric, date, detail }: {
  comparison: LastTimeComparison;
  /** The exercise's metric, which names the total (reps, time or metres). */
  metric: string;
  /** Day of last time's session, already formatted. */
  date: string;
  /** Last time's sets, shown on demand. */
  detail: string;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [open, setOpen] = useState(false);
  const { total, rest, form, improved, worse } = comparison;
  const totalLabel = metric === 'time' || metric === 'time_load' ? t('lastTime.totalTime') : metric === 'distance' ? t('lastTime.totalMeters') : t('lastTime.totalReps');
  const cells: { key: string; label: string; pairing: Pairing; trend: 'up' | 'down' | null; delta: string | null; format: (value: number) => string }[] = [];
  const signed = (value: number) => `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(Math.round(value * 10) / 10))}`;
  if (total) cells.push({ key: 'total', label: totalLabel, pairing: total, trend: improved.total ? 'up' : null, delta: improved.total && total.now !== null ? signed(total.now - total.last) : null, format: (value) => formatNumber(value) });
  if (rest) cells.push({ key: 'rest', label: t('lastTime.restAverage'), pairing: rest, trend: improved.rest ? 'up' : null, delta: improved.rest && rest.now !== null ? `${signed(rest.now - rest.last)} s` : null, format: (value) => `${value} s` });
  if (form) cells.push({ key: 'form', label: t('lastTime.formAverage', { value: '' }).trim(), pairing: form, trend: improved.form ? 'up' : worse.form ? 'down' : null, delta: form.now !== null && form.now !== form.last ? signed(form.now - form.last) : null, format: (value) => formatNumber(value) });
  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: palette.textMuted }]}>{t('lastTime.title', { date })}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          onPress={() => { tapFeedback(); setOpen((current) => !current); }}
          style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.toggleText, { color: palette.accentStrong }]}>{open ? t('lastTime.hideSets') : t('lastTime.showSets')}</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={palette.accentStrong} />
        </Pressable>
      </View>
      <View style={styles.cells}>
        {cells.map((cell) => {
          const tone = cell.trend === 'up' ? palette.success : cell.trend === 'down' ? palette.warning : null;
          const now = cell.pairing.now === null ? '–' : cell.format(cell.pairing.now);
          const spoken = `${cell.label}: ${t('lastTime.todaySpoken', { value: now })}, ${t('lastTime.lastSpoken', { value: cell.format(cell.pairing.last) })}`
            + (cell.trend === 'up' ? `, ${t('lastTime.better')}` : cell.trend === 'down' ? `, ${t('lastTime.worse')}` : '');
          return (
            <View
              key={cell.key}
              accessible
              accessibilityLabel={spoken}
              style={[styles.cell, { borderColor: tone ?? palette.border }]}
            >
              <Text style={[styles.cellLabel, { color: palette.textMuted }]}>{cell.label}</Text>
              <View style={styles.values}>
                <Text style={[styles.now, { color: tone ?? palette.text }]}>{now}</Text>
                <Text style={[styles.today, { color: palette.textMuted }]}>{t('lastTime.today')}</Text>
                {cell.trend ? <Icon name={cell.trend === 'up' ? 'arrow-up' : 'arrow-down'} size={14} color={tone!} /> : null}
                {cell.trend && cell.delta ? <Text style={[styles.delta, { color: tone! }]}>{cell.delta}</Text> : null}
              </View>
              <Text style={[styles.last, { color: palette.textMuted }]}>{t('lastTime.lastValue', { value: cell.format(cell.pairing.last) })}</Text>
            </View>
          );
        })}
      </View>
      {open ? <Label style={styles.detail}>{detail}</Label> : null}
    </View>
  );
}

/** The "how clean was it" rating, 1–5, in the same chip style as the RPE row; tap the chosen one again to clear. */
export function FormRating({ value, onChange, sideLabel = '' }: { value: number | null; onChange: (value: number | null) => void; sideLabel?: string }) {
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
              accessibilityLabel={`${sideLabel} ${t('lastTime.formRating', { value: rating })}`.trim()}
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
  wrap: { gap: 6, marginTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 24 },
  toggleText: { fontFamily: fonts.semibold, fontSize: 13 },
  // Cells wrap onto a second line at large font sizes instead of squeezing.
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { flexGrow: 1, flexBasis: 96, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  cellLabel: { fontFamily: fonts.medium, fontSize: 12 },
  values: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  now: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, fontVariant: ['tabular-nums'] },
  today: { fontFamily: fonts.medium, fontSize: 12 },
  delta: { fontFamily: fonts.semibold, fontSize: 12, fontVariant: ['tabular-nums'] },
  last: { fontFamily: fonts.medium, fontSize: 12, fontVariant: ['tabular-nums'] },
  detail: { marginTop: 2 },
  formRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2, paddingTop: 4, paddingBottom: 8 },
  formLabel: { width: 40, alignItems: 'center' },
  formLabelText: { fontFamily: fonts.semibold, fontSize: 12 },
  formChips: { flexDirection: 'row', gap: 8 },
  chip: { width: 40, minHeight: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
});
