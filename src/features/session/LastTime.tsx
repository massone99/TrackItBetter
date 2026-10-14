import { FORM_VALUES } from '../../domain/formRating';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { LastTimeComparison, Pairing } from '../../domain/lastTime';
import { Icon, IconButton, Label, tapFeedback, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';

/**
 * This session against the last one: a title line ("Vs last time · Sat 3 Oct", with a button that shows
 * last time's sets) and one cell per measure, each reading "8 today" over "last time 26". A beaten
 * value turns green with ↑ and the gain; a lower average form turns red with ↓. A lower average RPE
 * for the same work is a mini PR too.
 */
export function LastTimeStrip({ comparison, metric, date, detail, compact = false }: {
  comparison: LastTimeComparison;
  /** The exercise's metric, which names the total (reps, time or metres). */
  metric: string;
  /** Day of last time's session, already formatted. */
  date: string;
  /** Last time's sets, shown on demand. */
  detail: string;
  /** One line instead of the cells (once the exercise has started), so the sets stay in view; the cells open on demand. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { total, rest, form, rpe, assist, assistUnknown, assistOrder, improved, worse } = comparison;
  const totalLabel = metric === 'time' || metric === 'time_load' ? t('lastTime.totalTime') : metric === 'distance' ? t('lastTime.totalMeters') : t('lastTime.totalReps');
  const cells: { key: string; label: string; pairing: Pairing; trend: 'up' | 'down' | null; delta: string | null; format: (value: number) => string }[] = [];
  const signed = (value: number) => `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(Math.round(value * 10) / 10))}`;
  if (total) cells.push({ key: 'total', label: totalLabel, pairing: total, trend: improved.total ? 'up' : null, delta: improved.total && total.now !== null ? signed(total.now - total.last) : null, format: (value) => formatNumber(value) });
  if (rest) cells.push({ key: 'rest', label: t('lastTime.restAverage'), pairing: rest, trend: improved.rest ? 'up' : null, delta: improved.rest && rest.now !== null ? `${signed(rest.now - rest.last)} s` : null, format: (value) => `${value} s` });
  // Average RPE shows only when last time had one; lower is a mini PR only for the same work.
  if (rpe) cells.push({ key: 'rpe', label: t('lastTime.rpeAverage'), pairing: rpe, trend: improved.rpe ? 'up' : null, delta: improved.rpe && rpe.now !== null ? signed(rpe.now - rpe.last) : null, format: (value) => formatNumber(value) });
  if (assist) cells.push({ key: 'assist', label: t('lastTime.assistAverage'), pairing: assist, trend: improved.assist ? 'up' : null, delta: improved.assist && assist.now !== null ? `${signed(assist.now - assist.last)} kg` : null, format: (value) => `${formatNumber(value)} kg` });
  if (form) cells.push({ key: 'form', label: t('lastTime.formAverage', { value: '' }).trim(), pairing: form, trend: improved.form ? 'up' : worse.form ? 'down' : null, delta: form.now !== null && form.now !== form.last ? signed(form.now - form.last) : null, format: (value) => formatNumber(value) });
  if (compact && !expanded) {
    const anyUp = cells.some((cell) => cell.trend === 'up') || assistOrder === 'less';
    const anyDown = cells.some((cell) => cell.trend === 'down');
    const line = cells.map((cell) => {
      const now = cell.pairing.now === null ? '–' : cell.format(cell.pairing.now);
      const mark = cell.trend === 'up' ? ' ↑' : cell.trend === 'down' ? ' ↓' : '';
      return `${cell.label} ${now}${mark} (${cell.format(cell.pairing.last)})`;
    }).concat(assistOrder ? [`${t(`lastTime.assistOrder.${assistOrder}`)}${assistOrder === 'less' ? ' ↑' : ''}`] : []).join(' · ');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={`${t('lastTime.title', { date })}. ${line}`}
        accessibilityHint={t('lastTime.showDetails')}
        onPress={() => { tapFeedback(); setExpanded(true); }}
        style={({ pressed }) => [styles.compact, { borderColor: anyDown ? palette.warning : anyUp ? palette.success : palette.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.flex}>
          <Text style={[styles.title, { color: palette.textMuted }]}>{t('lastTime.title', { date })}</Text>
          <Text style={[styles.compactLine, { color: palette.text }]}>{line}</Text>
        </View>
        <Icon name="chevron-down" size={16} color={palette.accentStrong} />
      </Pressable>
    );
  }
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
        {compact ? <IconButton icon="chevron-up" label={t('lastTime.hideDetails')} tone="plain" size={40} onPress={() => setExpanded(false)} /> : null}
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
      {assistOrder ? (
        // Without kg, the bands' strength order still says whether the help went down.
        <Label style={[styles.detail, assistOrder === 'less' ? { color: palette.success } : null]}>
          {`${t(`lastTime.assistOrder.${assistOrder}`)}${assistOrder === 'less' ? ' ↑' : ''}`}
        </Label>
      ) : null}
      {assistUnknown ? <Label style={styles.detail}>{t('lastTime.assistUnknown')}</Label> : null}
      {open ? <Label style={styles.detail}>{detail}</Label> : null}
    </View>
  );
}

/** The "how clean was it" rating, 1–5 in half steps, in the same chip style as the RPE row; tap the chosen one again to clear. */
export function FormRating({ value, onChange, sideLabel = '', scroll = false }: { value: number | null; onChange: (value: number | null) => void; sideLabel?: string; /** One line that scrolls sideways (like the RPE row) instead of wrapping. */ scroll?: boolean }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const strip = useRef<ScrollView>(null);
  const chips = FORM_VALUES.map((rating) => {
    const selected = value === rating;
    return (
      <Pressable
        key={rating}
        accessibilityRole="button"
        accessibilityLabel={`${sideLabel} ${t('lastTime.formRating', { value: formatNumber(rating) })}`.trim()}
        accessibilityState={{ selected }}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        onPress={() => { tapFeedback(); onChange(selected ? null : rating); }}
        style={[styles.chip, { backgroundColor: selected ? palette.accent : 'transparent', borderColor: selected ? palette.accent : palette.border }]}
      >
        <Text style={[styles.chipText, { color: selected ? palette.accentText : palette.text }]}>{formatNumber(rating)}</Text>
      </Pressable>
    );
  });
  // Opens on the chosen value, or around 3,5 where most ratings land.
  const focus = Math.max(0, (value === null ? FORM_VALUES.indexOf(3.5) : FORM_VALUES.indexOf(value as (typeof FORM_VALUES)[number])) - 1);
  return (
    <View style={styles.formRow}>
      <View style={styles.formLabel}><Text style={[styles.formLabelText, { color: palette.textMuted }]}>{t('lastTime.form')}</Text></View>
      {scroll ? (
        <ScrollView
          ref={strip}
          horizontal
          style={styles.formStrip}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.formScroll}
          onLayout={() => strip.current?.scrollTo({ x: focus * FORM_STEP, animated: false })}
        >
          {chips}
        </ScrollView>
      ) : <View style={styles.formChips}>{chips}</View>}
    </View>
  );
}

/** Width of one chip plus the gap after it, so the strip can scroll to a value. */
const FORM_STEP = 40 + 8;

const baseStyles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 8 },
  flex: { flex: 1, gap: 2 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 48 },
  compactLine: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
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
  formRow: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 2, paddingTop: 4, paddingBottom: 8 },
  formLabel: { minWidth: 40, minHeight: 36, paddingRight: 4, alignItems: 'center', justifyContent: 'center' },
  formLabelText: { fontFamily: fonts.semibold, fontSize: 12 },
  // Nine values (1 to 5 in half steps) wrap onto a second line on narrow screens.
  formStrip: { flex: 1, marginRight: 76 },
  formScroll: { gap: 8, paddingRight: 8 },
  formChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 40, paddingHorizontal: 4, minHeight: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
});
