/**
 * TrackItBetter active-exercise telemetry — dependency-free calculation kernel.
 * Source contract: TrackItBetter v0.59.6, where reps/load/ratings are saved per SessionSet.
 *
 * This is an integration-ready pure module, not the PR authority. Official PRs must
 * continue to come from getSessionRecords() / detectSetRecords().
 */

export type Metric = 'reps' | 'reps_load' | 'time' | 'time_load' | 'distance';
export type PairScope = 'average' | 'left' | 'right' | 'legacy';
export type PrStatus = 'none' | 'candidate' | 'confirmed' | 'first-at-load' | 'uncomparable';

export interface TelemetrySet {
  id: string;
  kind: 'working' | 'warmup';
  completedAt: Date | string | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  assistKg: number | null;
  bands: readonly { bandId: string; tension: 1 | 2 | 3 }[];
  rpe: number | null;
  formRating: number | null;
  romRating: number | null;
  pairId?: string | null;
  side?: string;
}
export interface TelemetryHistorySession {
  workoutId: string;
  /** Only sessions with an equivalent comparison scope and apparatus may be passed. */
  sets: readonly TelemetrySet[];
}
export interface Sample {
  mean: number | null;
  count: number;
}
export interface MeasuredComparison {
  live: Sample;
  logged: Sample;
  historical: Sample;
  /** live − historical, not necessarily a sign of improvement. */
  delta: number | null;
}
export interface VolumeSummary {
  /** Reps / seconds / metres: always meaningful regardless of external load. */
  workUnit: 'reps' | 's' | 'm';
  liveWork: number;
  loggedWork: number;
  historicalPreviousWork: number | null;
  /** Load-volume uses the same positive NET load definition as records.ts. */
  loadedUnit: 'kg·reps' | 'kg·s' | null;
  liveLoaded: number | null;
  loggedLoaded: number | null;
  historicalPreviousLoaded: number | null;
  historicalMaxLoaded: number | null;
}
export interface AssistanceSummary {
  visible: boolean;
  live: Sample;
  logged: Sample;
  historical: Sample;
  unknown: boolean;
  /** Null if comparison is impossible because any included bands have unknown kg. */
  delta: number | null;
}
export interface BestComparable {
  /** Best reps/seconds at the currently edited set's net load. */
  current: number | null;
  historical: number | null;
  netLoadKg: number | null;
  status: PrStatus;
  /** No previous set at this load is NOT a record. */
  hasPreviousAtLoad: boolean;
}
export interface ExerciseTelemetry {
  mode: 'preview' | 'logged';
  rpe: MeasuredComparison;
  form: MeasuredComparison;
  rom: MeasuredComparison;
  assistance: AssistanceSummary;
  volume: VolumeSummary;
  bestComparable: BestComparable;
  eligibleWorkingSets: number;
  loggedWorkingSets: number;
}
export interface TelemetryInput {
  metric: Metric;
  currentSets: readonly TelemetrySet[];
  /** The active set to include as a preview, even if uncompleted. Null = none. */
  activeSetId: string | null;
  /** Finished sessions only; supplied newest first, already filtered by apparatus/scope. */
  history: readonly TelemetryHistorySession[];
  /** Deliberately configured or inferred from saved/history bands, never from the metric. */
  usesBands: boolean;
  /** Confirmed record kinds from the EXISTING detector for committed sets. */
  confirmedRecordSetIds?: ReadonlySet<string>;
  scope?: PairScope;
  baselineSessions?: number;
}

const round = (value: number) => Math.round(value * 10) / 10;
const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const mean = (arr: readonly number[]): Sample => ({ mean: arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length) : null, count: arr.length });
const safeNumber = (v: number | null | undefined) => (finite(v) ? Math.max(0, v) : 0);
const isDone = (s: TelemetrySet) => s.completedAt !== null;
const amount = (s: TelemetrySet, metric: Metric) => metric === 'time' || metric === 'time_load' ? safeNumber(s.durationSec) : metric === 'distance' ? safeNumber(s.distanceM) : safeNumber(s.reps);
const isLoaded = (metric: Metric) => metric === 'reps_load' || metric === 'time_load';
/** 0 without bands; unknown with bands and no reliable kg estimate. */
const assistance = (s: TelemetrySet): number | null => s.bands.length ? s.assistKg : 0;
/** Signed load, same definition as domain/strengthEstimates.ts. */
export function netLoad(set: TelemetrySet): number | null {
  const assist = assistance(set);
  return assist === null || !finite(set.addedLoadKg) ? null : set.addedLoadKg - assist;
}

/**
 * Normalize unilateral L/R pair to one observation, like groupSets/perSet.
 * An unfinished pair is excluded from logged readings; an active pair is previewed
 * only when both sides are known. A partial L/R preview is never presented as full.
 */
function observations(sets: readonly TelemetrySet[], scope: PairScope, activeSetId: string | null): TelemetrySet[][] {
  const relevant = sets.filter(s => s.kind === 'working' && (isDone(s) || s.id === activeSetId));
  if (scope === 'left' || scope === 'right') return relevant.filter(s => s.side === scope).map(s => [s]);
  if (scope === 'legacy') return relevant.filter(s => !s.pairId && (!s.side || s.side === 'both')).map(s => [s]);
  const groups: TelemetrySet[][] = [];
  const byPair = new Map<string, TelemetrySet[]>();
  for (const set of relevant) {
    if (!set.pairId) { groups.push([set]); continue; }
    let group = byPair.get(set.pairId);
    if (!group) { group = []; byPair.set(set.pairId, group); groups.push(group); }
    group.push(set);
  }
  // Do not treat one half of a pair as a full exercise set.
  return groups.filter(group => group.length === 1 ? !group[0].pairId : group.length === 2 && group.some(s => s.side === 'left') && group.some(s => s.side === 'right'));
}

function groupedMeanValue(group: readonly TelemetrySet[], getter: (s: TelemetrySet) => number | null): number | null {
  const values = group.map(getter).filter(finite);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
function rating(groups: readonly TelemetrySet[][], key: 'rpe' | 'formRating' | 'romRating'): Sample {
  return mean(groups.map(g => groupedMeanValue(g, s => s[key])).filter(finite));
}
function comparison(live: readonly TelemetrySet[][], logged: readonly TelemetrySet[][], historical: readonly TelemetrySet[][], key: 'rpe' | 'formRating' | 'romRating'): MeasuredComparison {
  const now = rating(live, key);
  const base = rating(historical, key);
  return { live: now, logged: rating(logged, key), historical: base, delta: now.mean === null || base.mean === null ? null : round(now.mean - base.mean) };
}
function sumWork(groups: readonly TelemetrySet[][], metric: Metric): number {
  return round(groups.reduce((sum, group) => sum + (groupedMeanValue(group, s => amount(s, metric)) ?? 0), 0));
}
function sumLoaded(groups: readonly TelemetrySet[][], metric: Metric): number | null {
  if (!isLoaded(metric)) return null;
  // A set with unknown net load cannot have a valid load-volume estimate.
  if (groups.some(g => g.some(s => netLoad(s) === null))) return null;
  return round(groups.reduce((sum, group) => sum + (groupedMeanValue(group, s => amount(s, metric) * Math.max(0, netLoad(s)!)) ?? 0), 0));
}
function workUnit(metric: Metric): VolumeSummary['workUnit'] { return metric === 'distance' ? 'm' : metric === 'time' || metric === 'time_load' ? 's' : 'reps'; }
function loadedUnit(metric: Metric): VolumeSummary['loadedUnit'] { return metric === 'reps_load' ? 'kg·reps' : metric === 'time_load' ? 'kg·s' : null; }
function bandAverage(groups: readonly TelemetrySet[][]): { sample: Sample; unknown: boolean } {
  const vals = groups.map(g => g.some(s => assistance(s) === null) ? null : groupedMeanValue(g, assistance));
  return { sample: mean(vals.filter(finite)), unknown: vals.some(v => v === null) };
}
function bestAtLoad(groups: readonly TelemetrySet[][], metric: Metric, load: number | null): number | null {
  if (load === null || metric === 'distance') return null;
  const comparable = groups.filter(group => group.every(s => netLoad(s) !== null && Math.abs(netLoad(s)! - load) < 1e-6));
  const amounts = comparable.map(g => groupedMeanValue(g, s => amount(s, metric))).filter(finite);
  return amounts.length ? Math.max(...amounts) : null;
}
/** Pure projection; callers should memoize and pass reference history from a cache. */
export function deriveExerciseTelemetry(input: TelemetryInput): ExerciseTelemetry {
  const scope = input.scope ?? 'average';
  const baselineSessions = Math.max(1, Math.floor(input.baselineSessions ?? 5));
  const completed = input.currentSets.filter(isDone);
  const live = observations(input.currentSets, scope, input.activeSetId);
  const logged = observations(completed, scope, null);
  const baseline = input.history.slice(0, baselineSessions);
  const historicGroups = baseline.flatMap(session => observations(session.sets, scope, null));
  const active = input.currentSets.find(s => s.id === input.activeSetId) ?? null;
  const allHistoryGroups = input.history.flatMap(session => observations(session.sets, scope, null));
  const activeNet = active ? netLoad(active) : null;
  const bestNow = active ? bestAtLoad(live, input.metric, activeNet) : null;
  const bestHistory = active ? bestAtLoad(allHistoryGroups, input.metric, activeNet) : null;
  const confirmed = !!active && isDone(active) && !!input.confirmedRecordSetIds?.has(active.id);
  const badComparison = !!active && activeNet === null;
  const status: PrStatus = !active ? 'none' : confirmed ? 'confirmed'
    : badComparison ? 'uncomparable' : bestHistory === null ? 'first-at-load'
    : bestNow !== null && bestNow > bestHistory ? (isDone(active) ? 'none' : 'candidate') : 'none';
  const bLive = bandAverage(live), bLogged = bandAverage(logged), bHistory = bandAverage(historicGroups);
  const bandUnknown = bLive.unknown || bHistory.unknown;
  const historicVolumeBySession = baseline.map(session => sumLoaded(observations(session.sets, scope, null), input.metric));
  const previousGroups = baseline[0] ? observations(baseline[0].sets, scope, null) : null;
  return {
    mode: active && !isDone(active) ? 'preview' : 'logged',
    rpe: comparison(live, logged, historicGroups, 'rpe'),
    form: comparison(live, logged, historicGroups, 'formRating'),
    rom: comparison(live, logged, historicGroups, 'romRating'),
    assistance: {
      visible: input.usesBands,
      live: bLive.sample,
      logged: bLogged.sample,
      historical: bHistory.sample,
      unknown: bandUnknown,
      delta: bandUnknown || bLive.sample.mean === null || bHistory.sample.mean === null ? null : round(bLive.sample.mean - bHistory.sample.mean),
    },
    volume: {
      workUnit: workUnit(input.metric),
      liveWork: sumWork(live, input.metric),
      loggedWork: sumWork(logged, input.metric),
      historicalPreviousWork: previousGroups ? sumWork(previousGroups, input.metric) : null,
      loadedUnit: loadedUnit(input.metric),
      liveLoaded: sumLoaded(live, input.metric),
      loggedLoaded: sumLoaded(logged, input.metric),
      historicalPreviousLoaded: previousGroups ? sumLoaded(previousGroups, input.metric) : null,
      historicalMaxLoaded: historicVolumeBySession.length && historicVolumeBySession.every(finite) ? Math.max(...(historicVolumeBySession as number[])) : null,
    },
    bestComparable: { current: bestNow, historical: bestHistory, netLoadKg: activeNet, status, hasPreviousAtLoad: bestHistory !== null },
    eligibleWorkingSets: live.length,
    loggedWorkingSets: logged.length,
  };
}
