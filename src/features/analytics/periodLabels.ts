import type { StatsPeriod, StatsPeriodKind } from './trainingStats';

const monthShort = (date: Date, locale: string) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(date).replace('.', '');
const dayMonth = (date: Date, locale: string) => `${date.getDate()} ${monthShort(date, locale)}`;
const capitalise = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** Navigator label for the selected period, e.g. "21–27 Sep", "Settembre 2026". */
export function formatPeriod(period: StatsPeriod, kind: StatsPeriodKind, locale: string): string {
  const { start, end } = period;
  if (kind === 'session') {
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(start);
    return `${period.workoutName ?? ''} · ${dayMonth(start, locale)}, ${time}`;
  }
  if (kind === 'day') {
    return `${capitalise(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(start).replace('.', ''))} ${dayMonth(start, locale)}`;
  }
  if (kind === 'week') {
    return start.getMonth() === end.getMonth()
      ? `${start.getDate()}–${end.getDate()} ${monthShort(end, locale)}`
      : `${dayMonth(start, locale)} – ${dayMonth(end, locale)}`;
  }
  return capitalise(new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(start));
}

/** Tiny label under the first and last chart column. */
export function formatPeriodShort(start: Date, kind: StatsPeriodKind, locale: string): string {
  return kind === 'month' ? monthShort(start, locale) : dayMonth(start, locale);
}
