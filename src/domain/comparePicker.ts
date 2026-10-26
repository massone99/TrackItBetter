import { amountOf, perSet, type ComparableSet } from './lastTime';

/** What the picker needs of one past session of an exercise. */
export interface PickableSession {
  workoutId: string;
  workoutName: string;
  startedAt: Date;
  notes: string | null;
  sets: readonly (ComparableSet & { addedLoadKg: number })[];
}

export type PeriodFilter = 'all' | '30d' | '90d' | '365d';
export type SortKey = 'recent' | 'volume' | 'best' | 'heaviest';
export interface PickFilters { period: PeriodFilter; name: string | null; hardOnly: boolean; withNote: boolean; query: string }
export const NO_FILTERS: PickFilters = { period: 'all', name: null, hardOnly: false, withNote: false, query: '' };

/** Average RPE from this value on counts as a hard session. */
export const HARD_RPE = 8;

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<PeriodFilter, number | null> = { all: null, '30d': 30, '90d': 90, '365d': 365 };

export interface SessionFigures { total: number; best: number; heaviest: number; rpe: number | null }

/** Total work, best set, heaviest load and average RPE of the working sets. */
export function figuresOf(session: PickableSession, metric: string): SessionFigures {
  const amounts = perSet(session.sets.map((set) => ({ ...set, completedAt: set.completedAt ?? new Date(0) })), (set) => amountOf(set, metric));
  const working = session.sets.filter((set) => set.kind !== 'warmup');
  const rpes = working.map((set) => set.rpe).filter((value): value is number => value != null);
  return {
    total: amounts.reduce((sum, value) => sum + value, 0),
    best: amounts.length ? Math.max(...amounts) : 0,
    heaviest: working.length ? Math.max(...working.map((set) => set.addedLoadKg)) : 0,
    rpe: rpes.length ? rpes.reduce((sum, value) => sum + value, 0) / rpes.length : null,
  };
}

const dayLabel = (date: Date, locale: string) => date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

/** Sessions that pass the filters, in the order asked (ties keep the newest first). */
export function filterSessions<T extends PickableSession>(all: readonly T[], filters: PickFilters, sort: SortKey, metric: string, locale: string, now: Date = new Date()): T[] {
  const days = PERIOD_DAYS[filters.period];
  const query = filters.query.trim().toLowerCase();
  const kept = all.filter((session) => {
    if (days !== null && now.getTime() - session.startedAt.getTime() > days * DAY_MS) return false;
    if (filters.name !== null && session.workoutName !== filters.name) return false;
    if (filters.withNote && !session.notes?.trim()) return false;
    if (filters.hardOnly && (figuresOf(session, metric).rpe ?? 0) < HARD_RPE) return false;
    if (query && ![session.workoutName, session.notes ?? '', dayLabel(session.startedAt, locale), session.startedAt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })].some((text) => text.toLowerCase().includes(query))) return false;
    return true;
  });
  const recent = [...kept].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  if (sort === 'recent') return recent;
  const key = sort === 'volume' ? 'total' : sort === 'best' ? 'best' : 'heaviest';
  const figures = new Map(recent.map((session) => [session.workoutId, figuresOf(session, metric)[key]] as const));
  return recent.sort((a, b) => (figures.get(b.workoutId) ?? 0) - (figures.get(a.workoutId) ?? 0));
}

export type ShortcutId = 'last' | 'sameWorkout' | 'bestVolume' | 'bestSet' | 'heaviest' | 'first';
export interface Shortcut<T extends PickableSession = PickableSession> { id: ShortcutId; session: T }

/** The one-tap picks that exist for these sessions; `currentName` is the workout being logged now. */
export function shortcutsFor<T extends PickableSession>(all: readonly T[], metric: string, currentName: string): Shortcut<T>[] {
  if (all.length === 0) return [];
  const recent = [...all].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const top = (key: keyof SessionFigures): T => {
    const scored = recent.map((session) => ({ session, value: figuresOf(session, metric)[key] ?? 0 }));
    return scored.reduce((best, item) => (item.value > best.value ? item : best)).session;
  };
  const sameName = recent.find((session) => session.workoutName === currentName);
  const result: Shortcut<T>[] = [{ id: 'last', session: recent[0] }];
  if (sameName) result.push({ id: 'sameWorkout', session: sameName });
  result.push({ id: 'bestVolume', session: top('total') }, { id: 'bestSet', session: top('best') });
  if (metric !== 'time' && metric !== 'distance') result.push({ id: 'heaviest', session: top('heaviest') });
  if (recent.length > 1) result.push({ id: 'first', session: recent[recent.length - 1] });
  return result;
}

export interface MonthGroup<T> { key: string; label: string; items: T[] }

/** Newest-first sessions grouped by calendar month ("October 2026"), in their order. */
export function groupByMonth<T extends { startedAt: Date }>(sessions: readonly T[], locale: string): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const session of sessions) {
    const key = `${session.startedAt.getFullYear()}-${String(session.startedAt.getMonth() + 1).padStart(2, '0')}`;
    let group = groups.find((item) => item.key === key);
    if (!group) { group = { key, label: session.startedAt.toLocaleDateString(locale, { month: 'long', year: 'numeric' }), items: [] }; groups.push(group); }
    group.items.push(session);
  }
  return groups;
}

export interface CalendarCell<T> { day: number; sessions: T[] }

/** One month as weeks starting on Monday: leading blanks are null, then a cell per day with that day's sessions. */
export function monthGrid<T extends PickableSession>(year: number, month: number, sessions: readonly T[]): (CalendarCell<T> | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  const cells: (CalendarCell<T> | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1) {
    cells.push({ day, sessions: sessions.filter((session) => session.startedAt.getFullYear() === year && session.startedAt.getMonth() === month && session.startedAt.getDate() === day) });
  }
  return cells;
}
