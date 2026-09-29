import { estimateOneRepMax } from '../../domain';
import { setEstimate } from './estimates';
import { isMobilityTimedSet } from './mobility';
import { getEffectiveLoad, rowCategories, type CompletedSetRow } from './summary';

/**
 * Statistics explorer: any metric over time (per workout, day, week or month), narrowed by
 * training kind, category, movement pattern or exercise. Pure functions over completed sets.
 */

export type Granularity = 'workout' | 'day' | 'week' | 'month';
export type TrainingKind = 'all' | 'strength' | 'mobility';

export interface Scope {
  kind: TrainingKind;
  category?: string;
  pattern?: string;
  exerciseId?: string;
}

export type MetricId =
  | 'sessions' | 'sets' | 'exercises'
  | 'reps' | 'holdSec' | 'distanceM' | 'loadReps' | 'loadSec'
  | 'mobilityHoldSec' | 'mobilitySets'
  | 'bestReps' | 'bestHold' | 'bestLoad' | 'bestE1rm' | 'estMaxReps' | 'estMaxHold'
  | 'avgRpe' | 'sessionRpe' | 'trainingSec' | 'sleep' | 'energy' | 'soreness';

export type MetricFamily = 'counts' | 'volume' | 'mobility' | 'performance' | 'intensity';
export type MetricUnit = 'count' | 'reps' | 'seconds' | 'meters' | 'kgReps' | 'kgSeconds' | 'kg' | 'score';

export interface MetricDef {
  id: MetricId;
  family: MetricFamily;
  unit: MetricUnit;
  /** Summed metrics can be split into shares of a total; best-of and averages cannot. */
  additive: boolean;
}

export const METRICS: readonly MetricDef[] = [
  { id: 'sessions', family: 'counts', unit: 'count', additive: false },
  { id: 'sets', family: 'counts', unit: 'count', additive: true },
  { id: 'exercises', family: 'counts', unit: 'count', additive: false },
  { id: 'reps', family: 'volume', unit: 'reps', additive: true },
  { id: 'holdSec', family: 'volume', unit: 'seconds', additive: true },
  { id: 'distanceM', family: 'volume', unit: 'meters', additive: true },
  { id: 'loadReps', family: 'volume', unit: 'kgReps', additive: true },
  { id: 'loadSec', family: 'volume', unit: 'kgSeconds', additive: true },
  { id: 'mobilityHoldSec', family: 'mobility', unit: 'seconds', additive: true },
  { id: 'mobilitySets', family: 'mobility', unit: 'count', additive: true },
  { id: 'bestReps', family: 'performance', unit: 'reps', additive: false },
  { id: 'bestHold', family: 'performance', unit: 'seconds', additive: false },
  { id: 'bestLoad', family: 'performance', unit: 'kg', additive: false },
  { id: 'bestE1rm', family: 'performance', unit: 'kg', additive: false },
  { id: 'estMaxReps', family: 'performance', unit: 'reps', additive: false },
  { id: 'estMaxHold', family: 'performance', unit: 'seconds', additive: false },
  { id: 'avgRpe', family: 'intensity', unit: 'score', additive: false },
  { id: 'sessionRpe', family: 'intensity', unit: 'score', additive: false },
  { id: 'trainingSec', family: 'intensity', unit: 'seconds', additive: false },
  { id: 'sleep', family: 'intensity', unit: 'score', additive: false },
  { id: 'energy', family: 'intensity', unit: 'score', additive: false },
  { id: 'soreness', family: 'intensity', unit: 'score', additive: false },
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((metric) => [metric.id, metric])) as Record<MetricId, MetricDef>;

export interface ExploreWorkout {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date | null;
  sessionRpe: number | null;
  sleep: number | null;
  energy: number | null;
  soreness: number | null;
}

export interface ExploreData {
  rows: readonly CompletedSetRow[];
  workouts: readonly ExploreWorkout[];
}

export interface Bucket {
  key: string;
  start: Date;
  /** Exclusive end. */
  end: Date;
  /** Null when nothing in the bucket can produce the metric (no sets, no ratings…). */
  value: number | null;
  workoutIds: string[];
}

/** How many buckets one page of the chart shows. */
export const PAGE_SIZE: Record<Granularity, number> = { workout: 20, day: 30, week: 12, month: 12 };

const BEST_E1RM_MAX_REPS = 36;

export function matchesScope(row: CompletedSetRow, scope: Scope): boolean {
  if (scope.kind === 'mobility' && row.category !== 'mobility') return false;
  if (scope.kind === 'strength' && (row.category === 'mobility' || row.category === 'cardio')) return false;
  if (scope.category && !rowCategories(row).includes(scope.category)) return false;
  if (scope.pattern && row.movementPattern !== scope.pattern) return false;
  if (scope.exerciseId && row.exerciseId !== scope.exerciseId) return false;
  return true;
}

/** One metric over a set of rows and the workouts they belong to. */
export function computeMetric(metric: MetricId, rows: readonly CompletedSetRow[], workouts: readonly ExploreWorkout[]): number | null {
  switch (metric) {
    case 'sessions': return new Set(rows.map((row) => row.workoutId)).size;
    case 'sets': return rows.length;
    case 'exercises': return new Set(rows.map((row) => row.exerciseId)).size;
    case 'reps': return sum(rows, (row) => (isRepMetric(row) ? row.reps : null));
    case 'holdSec': return sum(rows, (row) => (isTimeMetric(row) ? row.durationSec : null));
    case 'distanceM': return sum(rows, (row) => (row.metric === 'distance' ? row.distanceM : null));
    case 'loadReps': return sum(rows, (row) => (row.metric === 'reps_load' ? loadTimes(row, row.reps) : null));
    case 'loadSec': return sum(rows, (row) => (row.metric === 'time_load' ? loadTimes(row, row.durationSec) : null));
    case 'mobilityHoldSec': return sum(rows, (row) => (isMobilityTimedSet(row) ? row.durationSec : null));
    case 'mobilitySets': return rows.filter((row) => row.category === 'mobility').length;
    case 'bestReps': return max(rows, (row) => (isRepMetric(row) ? row.reps : null));
    case 'bestHold': return max(rows, (row) => (isTimeMetric(row) ? row.durationSec : null));
    case 'bestLoad': return max(rows, (row) => (row.metric === 'reps_load' || row.metric === 'time_load' ? getEffectiveLoad(row) ?? null : null));
    case 'bestE1rm': return max(rows, oneRepMax);
    case 'estMaxReps': return max(rows, (row) => { const estimate = setEstimate(row); return estimate?.kind === 'reps' ? estimate.value : null; });
    case 'estMaxHold': return max(rows, (row) => { const estimate = setEstimate(row); return estimate?.kind === 'hold' ? estimate.value : null; });
    case 'avgRpe': return average(rows.map((row) => row.rpe ?? null));
    case 'sessionRpe': return average(workouts.map((workout) => workout.sessionRpe));
    case 'sleep': return average(workouts.map((workout) => workout.sleep));
    case 'energy': return average(workouts.map((workout) => workout.energy));
    case 'soreness': return average(workouts.map((workout) => workout.soreness));
    case 'trainingSec': {
      const durations = workouts.map((workout) => (workout.endedAt ? (workout.endedAt.getTime() - workout.startedAt.getTime()) / 1000 : null));
      return durations.some((value) => value != null) ? sum(durations, (value) => value) : null;
    }
  }
}

/**
 * Metrics that have at least one value in scope. Performance metrics compare like with like,
 * so they are offered only for a single exercise.
 */
export function availableMetrics(data: ExploreData, scope: Scope): MetricId[] {
  const rows = data.rows.filter((row) => matchesScope(row, scope));
  if (rows.length === 0) return ['sessions', 'sets'];
  const workouts = workoutsFor(data, rows);
  return METRICS.filter((metric) => {
    if (metric.family === 'performance' && !scope.exerciseId) return false;
    if (metric.family === 'mobility' && (scope.kind === 'mobility' || scope.category === 'mobility' || scope.exerciseId)) return false;
    const value = computeMetric(metric.id, rows, workouts);
    return metric.family === 'counts' || (value != null && value > 0);
  }).map((metric) => metric.id);
}

export interface SeriesOptions {
  granularity: Granularity;
  scope: Scope;
  metric: MetricId;
  now: Date;
  /** 0 is the latest page; each step goes one page further back. */
  page: number;
}

export interface Series {
  buckets: Bucket[];
  hasOlder: boolean;
}

export function buildSeries(data: ExploreData, options: SeriesOptions): Series {
  const rows = data.rows.filter((row) => matchesScope(row, options.scope));
  const workoutById = new Map(data.workouts.map((workout) => [workout.id, workout]));
  const size = PAGE_SIZE[options.granularity];

  if (options.granularity === 'workout') {
    const byWorkout = groupBy(rows, (row) => row.workoutId);
    const ordered = [...byWorkout.keys()]
      .map((id) => ({ id, startedAt: workoutById.get(id)?.startedAt ?? byWorkout.get(id)![0].workoutStartedAt }))
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    const end = ordered.length - options.page * size;
    const slice = ordered.slice(Math.max(0, end - size), Math.max(0, end));
    return {
      hasOlder: end - size > 0,
      buckets: slice.map(({ id, startedAt }) => {
        const workout = workoutById.get(id);
        return {
          key: id,
          start: startedAt,
          end: workout?.endedAt ?? startedAt,
          value: computeMetric(options.metric, byWorkout.get(id)!, workout ? [workout] : []),
          workoutIds: [id],
        };
      }),
    };
  }

  const { granularity } = options;
  const latest = periodStart(options.now, granularity);
  const first = shift(latest, granularity, -(options.page + 1) * size + 1);
  const bucketed = groupBy(rows, (row) => periodStart(row.workoutStartedAt, granularity).getTime());
  const buckets: Bucket[] = [];
  for (let index = 0; index < size; index += 1) {
    const start = shift(first, granularity, index);
    const bucketRows = bucketed.get(start.getTime()) ?? [];
    buckets.push({
      key: periodKey(start, granularity),
      start,
      end: shift(start, granularity, 1),
      value: computeMetric(options.metric, bucketRows, workoutsFor(data, bucketRows)),
      workoutIds: [...new Set(bucketRows.map((row) => row.workoutId))],
    });
  }
  const oldest = rows.length ? Math.min(...rows.map((row) => row.workoutStartedAt.getTime())) : Infinity;
  return { buckets, hasOlder: oldest < first.getTime() };
}

export type BreakdownLevel = 'category' | 'pattern' | 'exercise';

/** Rows grouped for one level; an exercise in several categories lands in each of them. */
function groupRows(rows: CompletedSetRow[], level: BreakdownLevel): Map<string, CompletedSetRow[]> {
  if (level !== 'category') return groupBy(rows, (row) => (level === 'pattern' ? row.movementPattern ?? '' : row.exerciseId));
  const groups = new Map<string, CompletedSetRow[]>();
  for (const row of rows) {
    for (const category of rowCategories(row)) groups.set(category, [...(groups.get(category) ?? []), row]);
  }
  return groups;
}

export interface BreakdownItem {
  key: string;
  /** Exercise name for the exercise level; the raw key otherwise (labels are localized by the UI). */
  name: string;
  value: number;
  /** Share of the total for additive metrics, otherwise null. */
  share: number | null;
}

/** The next level to drill into from a scope, or null once a single exercise is selected. */
export function nextLevel(scope: Scope): BreakdownLevel | null {
  if (scope.exerciseId) return null;
  if (scope.pattern) return 'exercise';
  if (scope.category) return 'pattern';
  return 'category';
}

/** Splits one bucket's metric by the next level down, largest first. */
export function buildBreakdown(data: ExploreData, scope: Scope, metric: MetricId, bucket: Pick<Bucket, 'workoutIds'>): BreakdownItem[] {
  const level = nextLevel(scope);
  if (!level) return [];
  const ids = new Set(bucket.workoutIds);
  const rows = data.rows.filter((row) => ids.has(row.workoutId) && matchesScope(row, scope));
  const groups = groupRows(rows, level);
  const items: BreakdownItem[] = [];
  for (const [key, groupRows] of groups) {
    const value = computeMetric(metric, groupRows, workoutsFor(data, groupRows));
    if (value == null || value <= 0) continue;
    items.push({ key, name: level === 'exercise' ? groupRows[0].exerciseName : key, value, share: null });
  }
  if (METRIC_BY_ID[metric].additive) {
    // Of the period's own total: an exercise in two categories counts in both, so the shares of a
    // category split can add up to more than 100%.
    const total = computeMetric(metric, rows, workoutsFor(data, rows)) ?? 0;
    for (const item of items) item.share = total > 0 ? item.value / total : null;
  }
  return items.sort((a, b) => b.value - a.value);
}

export interface ScopeOption {
  key: string;
  name: string;
  sets: number;
}

/** The scope for one exercise, keeping the current category when the exercise also belongs to it. */
export function scopeForExercise(scope: Scope, row: CompletedSetRow): Scope {
  const categories = rowCategories(row);
  const category = scope.category && categories.includes(scope.category) ? scope.category : row.category;
  return { kind: scope.kind, category, pattern: row.movementPattern ?? undefined, exerciseId: row.exerciseId };
}

/** Choices for one scope level that have logged sets, most trained first. */
export function scopeOptions(data: ExploreData, scope: Scope, level: BreakdownLevel): ScopeOption[] {
  const parent: Scope = level === 'category' ? { kind: scope.kind } : level === 'pattern' ? { kind: scope.kind, category: scope.category } : { kind: scope.kind, category: scope.category, pattern: scope.pattern };
  const rows = data.rows.filter((row) => matchesScope(row, parent));
  const groups = groupRows(rows, level);
  return [...groups.entries()]
    .filter(([key]) => key !== '')
    .map(([key, groupRows]) => ({ key, name: level === 'exercise' ? groupRows[0].exerciseName : key, sets: groupRows.length }))
    .sort((a, b) => b.sets - a.sets);
}

/** Local start of the day, ISO week (Monday) or month containing `date`. */
export function periodStart(date: Date, granularity: Exclude<Granularity, 'workout'>): Date {
  if (granularity === 'month') return new Date(date.getFullYear(), date.getMonth(), 1);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (granularity === 'week') day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function shift(start: Date, granularity: Exclude<Granularity, 'workout'>, steps: number): Date {
  if (granularity === 'month') return new Date(start.getFullYear(), start.getMonth() + steps, 1);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + steps * (granularity === 'week' ? 7 : 1));
}

function periodKey(start: Date, granularity: Exclude<Granularity, 'workout'>): string {
  const month = String(start.getMonth() + 1).padStart(2, '0');
  if (granularity === 'month') return `${start.getFullYear()}-${month}`;
  return `${start.getFullYear()}-${month}-${String(start.getDate()).padStart(2, '0')}`;
}

function workoutsFor(data: ExploreData, rows: readonly CompletedSetRow[]): ExploreWorkout[] {
  const ids = new Set(rows.map((row) => row.workoutId));
  return data.workouts.filter((workout) => ids.has(workout.id));
}

function isRepMetric(row: CompletedSetRow): boolean {
  return row.metric === 'reps' || row.metric === 'reps_load';
}

function isTimeMetric(row: CompletedSetRow): boolean {
  return row.metric === 'time' || row.metric === 'time_load';
}

function loadTimes(row: CompletedSetRow, amount: number | null): number | null {
  const load = getEffectiveLoad(row);
  return load != null && amount != null ? load * amount : null;
}

function oneRepMax(row: CompletedSetRow): number | null {
  if (row.metric !== 'reps_load' || row.reps == null || row.reps <= 0 || row.reps > BEST_E1RM_MAX_REPS) return null;
  const load = getEffectiveLoad(row);
  if (load == null) return null;
  try {
    return estimateOneRepMax(load, row.reps);
  } catch {
    return null;
  }
}

function sum<T>(items: readonly T[], pick: (item: T) => number | null | undefined): number {
  return items.reduce((acc, item) => acc + (pick(item) ?? 0), 0);
}

function max<T>(items: readonly T[], pick: (item: T) => number | null | undefined): number | null {
  let best: number | null = null;
  for (const item of items) {
    const value = pick(item);
    if (value != null && value > 0 && (best == null || value > best)) best = value;
  }
  return best;
}

function average(values: readonly (number | null | undefined)[]): number | null {
  const present = values.filter((value): value is number => value != null);
  return present.length ? present.reduce((acc, value) => acc + value, 0) / present.length : null;
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
