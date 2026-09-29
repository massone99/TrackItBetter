import { calculateEffectiveLoad, calculateVolume, detectPersonalRecords, estimateOneRepMax } from '../../domain';
import { setEstimate } from './estimates';

export type ProgressMetric = 'reps' | 'time' | 'reps_load' | 'time_load' | 'distance';

export interface CompletedSetRow {
  workoutId: string;
  workoutStartedAt: Date;
  bodyweightKg: number | null;
  exerciseId: string;
  exerciseName: string;
  category: string;
  /** JSON list of additional categories; a planche set also counts as push. */
  extraCategories?: string;
  movementPattern: string | null;
  metric: string;
  leverageFactor: number | null;
  setId: string;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  completedAt: Date | null;
  /** Optional so callers that only need volume and records can omit it. */
  rpe?: number | null;
}

export interface PersonalBest {
  exerciseId: string;
  exerciseName: string;
  kind: 'reps' | 'hold' | 'load' | 'estimated1rm' | 'distance';
  value: number;
  achievedAt: Date;
}

export type TrendKind = 'reps' | 'hold' | 'effective_load' | 'added_load' | 'estimated1rm' | 'distance';

export interface TrendPoint {
  date: Date;
  value: number;
}

export interface ExerciseTrend {
  exerciseId: string;
  exerciseName: string;
  kind: TrendKind;
  points: TrendPoint[];
  /** Best RPE-based max estimate per workout, for bodyweight rep and hold trends. */
  estimate?: TrendPoint[];
}

export interface ProgressSnapshot {
  sessions: number;
  completedSets: number;
  weekSessions: number;
  weekSets: number;
  weeklyBalance: {
    pushSets: number;
    pullSets: number;
    horizontalPushSets: number;
    horizontalPullSets: number;
    verticalPushSets: number;
    verticalPullSets: number;
    legSets: number;
    totalSets: number;
    showLegsNudge: boolean;
  };
  volume: {
    reps: number;
    holdSeconds: number;
    distanceMeters: number;
    loadRepsKg: number;
    loadSecondsKg: number;
  };
  personalBests: PersonalBest[];
  trends: ExerciseTrend[];
}

export interface CompletedWorkoutRow {
  id: string;
  startedAt: Date;
}

/** Summarize distinct units separately so unlike work is never added together. */
export function buildProgressSnapshot(
  rows: readonly CompletedSetRow[],
  now = new Date(),
  completedWorkouts?: readonly CompletedWorkoutRow[],
): ProgressSnapshot {
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const allWorkouts = new Set<string>();
  const weeklyRows: CompletedSetRow[] = [];
  const weeklyBalance = {
    pushSets: 0,
    pullSets: 0,
    horizontalPushSets: 0,
    horizontalPullSets: 0,
    verticalPushSets: 0,
    verticalPullSets: 0,
    legSets: 0,
    totalSets: 0,
    showLegsNudge: false,
  };
  const candidates: { exerciseId: string; type: 'max_reps' | 'max_hold' | 'max_load' | 'e1rm' | 'volume'; value: number; setId: string; achievedAt: string }[] = [];
  const distances = new Map<string, PersonalBest>();
  const exerciseNames = new Map<string, string>();
  const trendPoints = new Map<string, { exerciseId: string; exerciseName: string; kind: TrendKind; date: Date; value: number }>();
  const estimatePoints = new Map<string, { trendKey: string; date: Date; value: number }>();
  const volumeSets: { reps?: number; durationSec?: number; effectiveLoadKg?: number }[] = [];
  let distanceMeters = 0;

  for (const row of rows) {
    if (!row.completedAt) continue;
    allWorkouts.add(row.workoutId);
    exerciseNames.set(row.exerciseId, row.exerciseName);
    const metric = row.metric as ProgressMetric;
    const inWeek = row.workoutStartedAt.getTime() >= weekStart && row.workoutStartedAt.getTime() <= now.getTime();
    if (inWeek) {
      weeklyRows.push(row);
      weeklyBalance.totalSets += 1;
      const extras = row.extraCategories ?? '[]';
      if (row.category === 'push' || extras.includes('"push"')) weeklyBalance.pushSets += 1;
      if (row.category === 'pull' || extras.includes('"pull"')) weeklyBalance.pullSets += 1;
      if (row.movementPattern === 'horizontal-push') weeklyBalance.horizontalPushSets += 1;
      if (row.movementPattern === 'horizontal-pull') weeklyBalance.horizontalPullSets += 1;
      if (row.movementPattern === 'vertical-push') weeklyBalance.verticalPushSets += 1;
      if (row.movementPattern === 'vertical-pull') weeklyBalance.verticalPullSets += 1;
      if (row.category === 'legs' || (row.category !== 'mobility' && isLegPattern(row.movementPattern))) weeklyBalance.legSets += 1;
    }

    const completedAt = row.completedAt.toISOString();
    const reps = row.reps ?? undefined;
    const durationSec = row.durationSec ?? undefined;
    const distanceM = row.distanceM ?? undefined;
    const effectiveLoad = getEffectiveLoad(row);
    const trendValues: { kind: TrendKind; value: number }[] = [];

    if ((metric === 'reps' || metric === 'reps_load') && reps != null && reps > 0) {
      candidates.push({ exerciseId: row.exerciseId, type: 'max_reps', value: reps, setId: row.setId, achievedAt: completedAt });
      trendValues.push({ kind: 'reps', value: reps });
    }
    if ((metric === 'time' || metric === 'time_load') && durationSec != null && durationSec > 0) {
      candidates.push({ exerciseId: row.exerciseId, type: 'max_hold', value: durationSec, setId: row.setId, achievedAt: completedAt });
      trendValues.push({ kind: 'hold', value: durationSec });
    }
    if ((metric === 'reps_load' || metric === 'time_load') && effectiveLoad != null && effectiveLoad > 0) {
      candidates.push({ exerciseId: row.exerciseId, type: 'max_load', value: effectiveLoad, setId: row.setId, achievedAt: completedAt });
      trendValues.push({ kind: row.leverageFactor != null ? 'effective_load' : 'added_load', value: row.leverageFactor != null ? effectiveLoad : row.addedLoadKg });
      if (metric === 'reps_load' && reps != null && reps > 0 && reps <= 36) {
        try {
          const e1rm = estimateOneRepMax(effectiveLoad, reps);
          candidates.push({ exerciseId: row.exerciseId, type: 'e1rm', value: e1rm, setId: row.setId, achievedAt: completedAt });
          trendValues.push({ kind: 'estimated1rm', value: e1rm });
        } catch {
          // Invalid/incomplete sets do not contribute an estimated strength record.
        }
      }
    }
    if (metric === 'distance' && distanceM != null && distanceM > 0) {
      trendValues.push({ kind: 'distance', value: distanceM });
      const current = distances.get(row.exerciseId);
      if (!current || distanceM > current.value) {
        distances.set(row.exerciseId, { exerciseId: row.exerciseId, exerciseName: row.exerciseName, kind: 'distance', value: distanceM, achievedAt: row.completedAt });
      }
      distanceMeters += distanceM;
    }

    // Keep the best completed set for each exercise and workout. This makes a
    // session one chart point even when it contains several working sets.
    for (const { kind, value } of trendValues) {
      const key = `${row.exerciseId}:${kind}:${row.workoutId}`;
      const existing = trendPoints.get(key);
      if (!existing || value > existing.value) {
        trendPoints.set(key, {
          exerciseId: row.exerciseId,
          exerciseName: row.exerciseName,
          kind,
          date: row.workoutStartedAt,
          value,
        });
      }
    }

    const estimate = setEstimate(row);
    if (estimate) {
      const trendKey = `${row.exerciseId}:${estimate.kind}`;
      const key = `${trendKey}:${row.workoutId}`;
      const existing = estimatePoints.get(key);
      if (!existing || estimate.value > existing.value) estimatePoints.set(key, { trendKey, date: row.workoutStartedAt, value: estimate.value });
    }

    if (metric === 'reps' || metric === 'reps_load') {
      volumeSets.push({ reps, ...(metric === 'reps_load' && effectiveLoad != null ? { effectiveLoadKg: effectiveLoad } : {}) });
    } else if (metric === 'time' || metric === 'time_load') {
      volumeSets.push({ durationSec, ...(metric === 'time_load' && effectiveLoad != null ? { effectiveLoadKg: effectiveLoad } : {}) });
    }
  }

  const bests: PersonalBest[] = detectPersonalRecords(candidates).map((record) => ({
    exerciseId: record.exerciseId,
    exerciseName: exerciseNames.get(record.exerciseId) ?? record.exerciseId,
    kind: record.type === 'max_reps' ? 'reps' : record.type === 'max_hold' ? 'hold' : record.type === 'max_load' ? 'load' : record.type === 'e1rm' ? 'estimated1rm' : 'load',
    value: record.value,
    achievedAt: new Date(record.achievedAt!),
  }));
  bests.push(...distances.values());
  bests.sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
  const workouts = completedWorkouts ?? [...allWorkouts].map((id) => ({
    id,
    startedAt: rows.find((row) => row.workoutId === id)!.workoutStartedAt,
  }));
  const countedWorkouts = new Set(workouts.map((workout) => workout.id));
  const countedWeekWorkouts = workouts.filter((workout) =>
    workout.startedAt.getTime() >= weekStart && workout.startedAt.getTime() <= now.getTime(),
  );
  // Only suggest a balance check after a meaningful week of training data.
  // The threshold is intentionally a prompt, not a claim about adequate volume.
  weeklyBalance.showLegsNudge = new Set(weeklyRows.map((row) => row.workoutId)).size >= 3
    && weeklyBalance.totalSets >= 12
    && weeklyBalance.legSets < 3;
  const volume = calculateVolume(volumeSets);
  const trendGroups = new Map<string, ExerciseTrend>();
  for (const point of trendPoints.values()) {
    const key = `${point.exerciseId}:${point.kind}`;
    let trend = trendGroups.get(key);
    if (!trend) {
      trend = { exerciseId: point.exerciseId, exerciseName: point.exerciseName, kind: point.kind, points: [] };
      trendGroups.set(key, trend);
    }
    trend.points.push({ date: point.date, value: point.value });
  }
  for (const point of estimatePoints.values()) {
    const trend = trendGroups.get(point.trendKey);
    if (trend) (trend.estimate ??= []).push({ date: point.date, value: point.value });
  }
  const trends = [...trendGroups.values()]
    .map((trend) => ({
      ...trend,
      points: trend.points.sort((a, b) => a.date.getTime() - b.date.getTime()),
      ...(trend.estimate ? { estimate: trend.estimate.sort((a, b) => a.date.getTime() - b.date.getTime()) } : {}),
    }))
    .filter((trend) => trend.points.length >= 2)
    .sort((a, b) => b.points[b.points.length - 1].date.getTime() - a.points[a.points.length - 1].date.getTime());

  return {
    sessions: countedWorkouts.size,
    completedSets: rows.filter((row) => row.completedAt != null).length,
    weekSessions: countedWeekWorkouts.length,
    weekSets: weeklyRows.length,
    weeklyBalance,
    volume: {
      reps: volume.reps,
      holdSeconds: volume.durationSec,
      distanceMeters,
      loadRepsKg: volume.loadReps,
      loadSecondsKg: volume.loadSeconds,
    },
    personalBests: bests.slice(0, 8),
    trends,
  };
}

function isLegPattern(pattern: string | null): boolean {
  return pattern != null && [
    'squat', 'single-leg-squat', 'hip-extension', 'knee-flexion',
    'knee-extension', 'ankle-plantar-flexion',
  ].includes(pattern);
}

export function getEffectiveLoad(row: CompletedSetRow): number | undefined {
  if (row.leverageFactor != null) {
    if (row.bodyweightKg == null) return undefined;
    try {
      const load = calculateEffectiveLoad(row.bodyweightKg, row.leverageFactor, row.addedLoadKg);
      return load > 0 ? load : undefined;
    } catch {
      return undefined;
    }
  }
  return row.addedLoadKg > 0 ? row.addedLoadKg : undefined;
}

export interface WorkoutRecord {
  exerciseId: string;
  exerciseName: string;
  kind: 'reps' | 'hold' | 'load' | 'distance';
  value: number;
  previous: number;
}

/**
 * Records set in one workout: its best value per exercise and kind that beats every earlier
 * workout's best. A first-ever attempt has nothing to beat, so it is not reported.
 */
export function detectWorkoutRecords(rows: readonly CompletedSetRow[], workoutId: string): WorkoutRecord[] {
  const current = rows.filter((row) => row.workoutId === workoutId && row.completedAt);
  if (current.length === 0) return [];
  const startedAt = current[0].workoutStartedAt.getTime();
  const earlier = rows.filter((row) => row.workoutId !== workoutId && row.completedAt && row.workoutStartedAt.getTime() < startedAt);
  const previousBest = bestSetValues(earlier);
  const records: WorkoutRecord[] = [];
  for (const [key, best] of bestSetValues(current)) {
    const previous = previousBest.get(key);
    if (previous && best.value > previous.value) records.push({ ...best, previous: previous.value });
  }
  return records;
}

function bestSetValues(rows: readonly CompletedSetRow[]) {
  const best = new Map<string, Omit<WorkoutRecord, 'previous'>>();
  for (const row of rows) {
    const metric = row.metric as ProgressMetric;
    const values: { kind: WorkoutRecord['kind']; value: number | undefined }[] = [];
    if (metric === 'reps' || metric === 'reps_load') values.push({ kind: 'reps', value: row.reps ?? undefined });
    if (metric === 'time' || metric === 'time_load') values.push({ kind: 'hold', value: row.durationSec ?? undefined });
    if (metric === 'reps_load' || metric === 'time_load') values.push({ kind: 'load', value: getEffectiveLoad(row) });
    if (metric === 'distance') values.push({ kind: 'distance', value: row.distanceM ?? undefined });
    for (const { kind, value } of values) {
      if (value == null || value <= 0) continue;
      const key = `${row.exerciseId}:${kind}`;
      const existing = best.get(key);
      if (!existing || value > existing.value) best.set(key, { exerciseId: row.exerciseId, exerciseName: row.exerciseName, kind, value });
    }
  }
  return best;
}
