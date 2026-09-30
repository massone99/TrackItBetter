import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/typography';
import { useScaledStyles } from '../theme/useScaledStyles';
import { Chip, Icon, IconButton, Text, tapFeedback } from './ui';
import { Wheel } from './Wheel';

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** A tappable row (label left, value right) that unfolds its picker underneath. */
export function FieldRow({ label, value, icon, open, onToggle }: { label: string; value: string; icon: 'calendar-outline' | 'time-outline' | 'timer-outline'; open: boolean; onToggle: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ expanded: open }}
      onPress={() => { tapFeedback(); onToggle(); }}
      style={styles.row}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={[styles.rowValue, { backgroundColor: open ? palette.accentSoft : palette.surfaceMuted }]}>
        <Icon name={icon} size={16} color={open ? palette.accentStrong : palette.textMuted} />
        <Text style={[styles.rowValueText, { color: open ? palette.accentStrong : palette.text }]}>{value}</Text>
      </View>
    </Pressable>
  );
}

/** Day picker: a month grid that keeps the time of day of `value`. Days after `maxDate` are disabled. */
export function DateField({ label, value, locale, maxDate, onChange }: {
  label: string;
  value: Date;
  locale: string;
  maxDate?: Date;
  onChange: (next: Date) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const today = new Date();
  const limit = dayStart(maxDate ?? new Date(8640000000000000));

  const days = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1));
  }, [month]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(locale, { weekday: 'narrow' })), [locale]);

  const pick = (day: Date) => {
    tapFeedback();
    onChange(new Date(day.getFullYear(), day.getMonth(), day.getDate(), value.getHours(), value.getMinutes()));
    setOpen(false);
  };
  const shift = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const canGoForward = new Date(month.getFullYear(), month.getMonth() + 1, 1) <= limit;

  return (
    <View>
      <FieldRow
        label={label}
        icon="calendar-outline"
        open={open}
        value={value.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: value.getFullYear() === today.getFullYear() ? undefined : 'numeric' })}
        onToggle={() => { setMonth(new Date(value.getFullYear(), value.getMonth(), 1)); setOpen((current) => !current); }}
      />
      {open ? (
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.monthHeader}>
            <IconButton icon="chevron-back" label={t('log.previousMonth')} tone="plain" size={40} onPress={() => shift(-1)} />
            <Text style={styles.monthTitle}>{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</Text>
            <IconButton icon="chevron-forward" label={t('log.nextMonth')} tone="plain" size={40} disabled={!canGoForward} onPress={() => shift(1)} />
          </View>
          <View style={styles.grid}>
            {weekdays.map((weekday, index) => <Text key={index} style={[styles.weekday, { color: palette.textMuted }]}>{weekday}</Text>)}
            {days.map((day) => {
              const inMonth = day.getMonth() === month.getMonth();
              const selected = sameDay(day, value);
              const disabled = day > limit;
              return (
                <Pressable
                  key={day.getTime()}
                  accessibilityRole="button"
                  accessibilityLabel={day.toLocaleDateString(locale, { dateStyle: 'full' })}
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => pick(day)}
                  style={[styles.cell, selected && { backgroundColor: palette.accent }, !selected && sameDay(day, today) && { borderWidth: 1, borderColor: palette.accentStrong }]}
                >
                  <Text style={[styles.cellText, { color: selected ? palette.accentText : palette.text, opacity: disabled ? 0.3 : inMonth ? 1 : 0.4 }]}>{day.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>
          {limit >= dayStart(today) ? (
            <View style={styles.shortcuts}>
              <Chip label={t('picker.today')} selected={sameDay(value, today)} onPress={() => pick(today)} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Time picker: tap the hour, then the minute, from two grids instead of stepping through them. */
export function TimeField({ label, hour, minute, locale, minuteStep = 5, defaultOpen = false, onChange }: {
  label: string;
  hour: number;
  minute: number;
  locale: string;
  minuteStep?: number;
  defaultOpen?: boolean;
  onChange: (hour: number, minute: number) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep);
  const text = new Date(2000, 0, 1, hour, minute).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const two = (value: number) => String(value).padStart(2, '0');

  return (
    <View>
      <FieldRow label={label} icon="time-outline" open={open} value={text} onToggle={() => setOpen((current) => !current)} />
      {open ? (
        <View style={[styles.panel, styles.wheels, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Wheel label={t('picker.hour')} items={Array.from({ length: 24 }, (_, value) => ({ value, label: two(value) }))} value={hour} onChange={(next) => onChange(next, minute)} />
          <Text style={[styles.colon, { color: palette.textMuted }]}>:</Text>
          <Wheel label={t('picker.minute')} items={minutes.map((value) => ({ value, label: two(value) }))} value={minute} onChange={(next) => onChange(hour, next)} />
        </View>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 40, borderRadius: 12 },
  rowValueText: { fontFamily: fonts.semibold, fontSize: 16, fontVariant: ['tabular-nums'] },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, gap: 8, marginBottom: 6 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontFamily: fonts.display, fontSize: 20, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.medium, fontSize: 12, paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, maxHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  cellText: { fontFamily: fonts.semibold, fontSize: 15, fontVariant: ['tabular-nums'] },
  shortcuts: { flexDirection: 'row', gap: 8 },
  wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  colon: { fontFamily: fonts.display, fontSize: 26 },
});

/**
 * Duration in seconds (rest, hold): a pill with the value that opens minute and second wheels.
 * With `defaultValue` a chip switches to "use the default" (value null).
 */
export function DurationField({ label, value, min = 0, max = 600, step = 5, defaultValue, format, onChange }: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  format: (seconds: number) => string;
  onChange: (value: number | null) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const effective = value ?? defaultValue ?? min;
  const wholeMinutes = Math.floor(effective / 60);
  const seconds = effective % 60;
  const minuteItems = Array.from({ length: Math.floor(max / 60) + 1 }, (_, index) => ({ value: index, label: String(index) }));
  const secondItems = Array.from({ length: Math.ceil(60 / step) }, (_, index) => ({ value: index * step, label: String(index * step).padStart(2, '0') }));
  const set = (minutes: number, secs: number) => onChange(Math.min(max, Math.max(min, minutes * 60 + secs)));
  return (
    <View>
      <FieldRow label={label} icon="timer-outline" open={open} value={value === null && defaultValue !== undefined ? t('userProgram.restDefaultValue', { value: defaultValue }) : format(effective)} onToggle={() => setOpen((current) => !current)} />
      {open ? (
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.wheels}>
            <Wheel label={t('picker.minutes')} items={minuteItems} value={wholeMinutes} onChange={(next) => set(next, seconds)} />
            <Text style={[styles.colon, { color: palette.textMuted }]}>:</Text>
            <Wheel label={t('picker.seconds')} items={secondItems} value={seconds - (seconds % step)} onChange={(next) => set(wholeMinutes, next)} />
          </View>
          {defaultValue !== undefined ? (
            <View style={styles.shortcuts}>
              <Chip label={t('userProgram.restDefaultValue', { value: defaultValue })} selected={value === null} onPress={() => onChange(null)} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
