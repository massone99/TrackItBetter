import { exerciseMovementTags, MOVEMENT_GROUP_IDS } from '../exercises/movementCatalog';

export type StatsDimension = 'group' | 'tag' | 'exercise';
export type StatsPeriodKind = 'session' | 'day' | 'week' | 'month';
type CalendarKind = Exclude<StatsPeriodKind, 'session'>;

/** Bucket for sets whose exercise has no movement group (or no tag, in tag view). */
export const OTHER_ID = '__other__';
const HISTORY_LENGTH = 8;

export interface StatsSetRow {
  workoutId: string;
  workoutName: string;
  workoutStartedAt: Date;
  exerciseId: string;
  exerciseName: string;
  metric: string;
  movementGroup: string | null;
  movementTag: string | null;
  movementTags?: string | null;
  reps: number | null;
  durationSec: number | null;
  addedLoadKg: number;
  rpe: number | null;
}

export interface StatsMetrics { sets: number; setsAtThreshold: number; reps: number; holdSeconds: number; loadRepsKg: number; loadSecondsKg: number }
export interface StatsItem { id: string; name: string; metrics: StatsMetrics }
/** `end` is the last day of the period (inclusive); for a session it equals `start`. */
export interface StatsPeriod { id: string; start: Date; end: Date; workoutName: string | null }
export interface StatsBar { id: string; start: Date; sets: number }
export interface TrainingStats {
  period: StatsPeriod | null;
  summary: StatsMetrics;
  items: StatsItem[];
  history: StatsBar[];
  olderId: string | null;
  newerId: string | null;
}
export interface StatsOptions { dimension: StatsDimension; period: StatsPeriodKind; anchor: string | null; threshold: number; rpeOnly?: boolean; now?: Date }

/** With `rpeOnly`, only sets at or above the threshold count; periods and sessions stay navigable. */
function counts(row: StatsSetRow, { threshold, rpeOnly }: StatsOptions): boolean {
  return !rpeOnly || (row.rpe != null && row.rpe >= threshold);
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function periodStart(date: Date, kind: CalendarKind): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), kind === 'month' ? 1 : date.getDate());
  if (kind === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function periodId(date: Date, kind: CalendarKind): string {
  const key = localDateKey(periodStart(date, kind));
  return kind === 'month' ? key.slice(0, 7) : key;
}

function shiftPeriod(id: string, kind: CalendarKind, steps: number): string {
  const start = dateFromKey(id);
  if (kind === 'month') start.setMonth(start.getMonth() + steps);
  else start.setDate(start.getDate() + steps * (kind === 'week' ? 7 : 1));
  return periodId(start, kind);
}

function periodEnd(start: Date, kind: CalendarKind): Date {
  if (kind === 'month') return new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const end = new Date(start);
  if (kind === 'week') end.setDate(end.getDate() + 6);
  return end;
}

export function buildTrainingStats(rows: readonly StatsSetRow[], options: StatsOptions): TrainingStats {
  if (options.period === 'session') return buildSessionStats(rows, options);
  const kind = options.period;
  const latest = periodId(options.now ?? new Date(), kind);
  const anchor = options.anchor && options.anchor <= latest ? options.anchor : latest;
  const idOf = (row: StatsSetRow) => periodId(row.workoutStartedAt, kind);
  const setsByPeriod = new Map<string, number>();
  const counted = rows.filter((row) => counts(row, options));
  for (const row of counted) setsByPeriod.set(idOf(row), (setsByPeriod.get(idOf(row)) ?? 0) + 1);
  const start = dateFromKey(anchor);
  const history = Array.from({ length: HISTORY_LENGTH }, (_, index) => shiftPeriod(anchor, kind, index - (HISTORY_LENGTH - 1)));
  return {
    period: { id: anchor, start, end: periodEnd(start, kind), workoutName: null },
    ...aggregate(counted.filter((row) => idOf(row) === anchor), options),
    history: history.map((id) => ({ id, start: dateFromKey(id), sets: setsByPeriod.get(id) ?? 0 })),
    olderId: rows.some((row) => idOf(row) < anchor) ? shiftPeriod(anchor, kind, -1) : null,
    newerId: anchor < latest ? shiftPeriod(anchor, kind, 1) : null,
  };
}

function buildSessionStats(rows: readonly StatsSetRow[], options: StatsOptions): TrainingStats {
  const sessions = new Map<string, { start: Date; name: string; sets: number }>();
  for (const row of rows) {
    const add = counts(row, options) ? 1 : 0;
    const session = sessions.get(row.workoutId);
    if (session) session.sets += add;
    else sessions.set(row.workoutId, { start: row.workoutStartedAt, name: row.workoutName, sets: add });
  }
  const ordered = [...sessions].sort(([, a], [, b]) => a.start.getTime() - b.start.getTime());
  if (ordered.length === 0) return { period: null, ...aggregate([], options), history: [], olderId: null, newerId: null };
  const found = ordered.findIndex(([id]) => id === options.anchor);
  const index = found >= 0 ? found : ordered.length - 1;
  const [id, session] = ordered[index];
  return {
    period: { id, start: session.start, end: session.start, workoutName: session.name },
    ...aggregate(rows.filter((row) => row.workoutId === id && counts(row, options)), options),
    history: ordered.slice(Math.max(0, index - HISTORY_LENGTH + 1), index + 1).map(([barId, bar]) => ({ id: barId, start: bar.start, sets: bar.sets })),
    olderId: index > 0 ? ordered[index - 1][0] : null,
    newerId: index < ordered.length - 1 ? ordered[index + 1][0] : null,
  };
}

function aggregate(rows: readonly StatsSetRow[], { dimension, threshold }: StatsOptions): { summary: StatsMetrics; items: StatsItem[] } {
  const summary = emptyMetrics();
  const items = new Map<string, StatsItem>();
  for (const row of rows) {
    // Count the set once in the total, and once under each associated tag.
    addSet(summary, row, threshold);
    for (const [id, name] of itemKeys(row, dimension)) {
      let item = items.get(id);
      if (!item) {
        item = { id, name, metrics: emptyMetrics() };
        items.set(id, item);
      }
      addSet(item.metrics, row, threshold);
    }
  }
  return { summary, items: [...items.values()].sort(compareItems) };
}

function itemKeys(row: StatsSetRow, dimension: StatsDimension): [string, string][] {
  if (dimension === 'exercise') return [[row.exerciseId, row.exerciseName]];
  if (dimension === 'tag') {
    const tags = exerciseMovementTags(row);
    return tags.length ? tags.map((tag) => [tag, tag]) : [[OTHER_ID, OTHER_ID]];
  }
  const value = (MOVEMENT_GROUP_IDS as readonly string[]).includes(row.movementGroup ?? '') ? row.movementGroup : null;
  return value ? [[value, value]] : [[OTHER_ID, OTHER_ID]];
}

function addSet(metrics: StatsMetrics, row: StatsSetRow, threshold: number) {
  metrics.sets += 1;
  if (row.rpe != null && row.rpe >= threshold) metrics.setsAtThreshold += 1;
  const load = Math.max(0, row.addedLoadKg);
  if (row.metric === 'reps' || row.metric === 'reps_load') {
    const reps = Math.max(0, row.reps ?? 0);
    metrics.reps += reps;
    metrics.loadRepsKg += load * reps;
  }
  if (row.metric === 'time' || row.metric === 'time_load') {
    const seconds = Math.max(0, row.durationSec ?? 0);
    metrics.holdSeconds += seconds;
    metrics.loadSecondsKg += load * seconds;
  }
}

function compareItems(a: StatsItem, b: StatsItem): number {
  if ((a.id === OTHER_ID) !== (b.id === OTHER_ID)) return a.id === OTHER_ID ? 1 : -1;
  return b.metrics.sets - a.metrics.sets || a.name.localeCompare(b.name);
}

function emptyMetrics(): StatsMetrics {
  return { sets: 0, setsAtThreshold: 0, reps: 0, holdSeconds: 0, loadRepsKg: 0, loadSecondsKg: 0 };
}
