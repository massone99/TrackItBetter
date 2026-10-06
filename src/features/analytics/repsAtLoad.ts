import { aggregatePairs, samePairValue, type Aggregated } from '../../domain/setPairs';
import { matchesScope, type ExploreData, type Scope } from './explore';
import type { ExerciseHistorySession } from './repository';

export interface RepsAtLoadSession {
  workoutId: string;
  workoutName: string;
  startedAt: Date;
  reps: number[];
  bestReps: number;
  totalReps: number;
}

export interface RepsAtLoadGroup {
  /** The signed load actually logged: added weight, zero, or assistance. */
  loadKg: number;
  sessions: RepsAtLoadSession[];
}

interface RepSet {
  workoutId: string;
  workoutName: string;
  startedAt: Date;
  loadKg: number;
  reps: number | null;
}

/** Compare the same logged load across sessions, without mixing bodyweight or assistance. */
function groupRepSets(sets: readonly RepSet[]): RepsAtLoadGroup[] {
  const loads = new Map<number, Map<string, RepsAtLoadSession>>();
  for (const set of sets) {
    if (set.reps == null || !Number.isFinite(set.reps) || set.reps < 0 || !Number.isFinite(set.loadKg)) continue;
    // Remove floating point noise while preserving fractional and negative loads.
    const loadKg = Math.round(set.loadKg * 1e6) / 1e6;
    let sessions = loads.get(loadKg);
    if (!sessions) { sessions = new Map(); loads.set(loadKg, sessions); }
    let session = sessions.get(set.workoutId);
    if (!session) {
      session = { workoutId: set.workoutId, workoutName: set.workoutName, startedAt: set.startedAt, reps: [], bestReps: 0, totalReps: 0 };
      sessions.set(set.workoutId, session);
    }
    session.reps.push(set.reps);
    session.bestReps = Math.max(session.bestReps, set.reps);
    session.totalReps += set.reps;
  }
  return [...loads].map(([loadKg, sessions]) => ({
    loadKg,
    sessions: [...sessions.values()].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.workoutId.localeCompare(b.workoutId)),
  })).sort((a, b) => b.sessions[b.sessions.length - 1].startedAt.getTime() - a.sessions[a.sessions.length - 1].startedAt.getTime() || b.loadKg - a.loadKg);
}

/** The exercise page already loads completed history, including warm-ups that we omit here. */
export function repsAtLoadFromHistory(history: readonly ExerciseHistorySession[]): RepsAtLoadGroup[] {
  return groupRepSets(history.flatMap((session) => aggregatePairs(session.sets).filter((set) => set.kind === 'working' && samePairValue(set, (s) => s.addedLoadKg)).map((set) => ({
    workoutId: session.workoutId, workoutName: session.workoutName, startedAt: session.startedAt,
    loadKg: set.addedLoadKg, reps: set.reps,
  }))));
}

/** Completed working sets of one exercise, already scoped to a side view (see `aggregatePairs`). */
export function repsAtLoadFromRows(
  rows: readonly (Aggregated<{ workoutId: string; workoutStartedAt: Date; addedLoadKg: number; reps: number | null; pairId?: string | null; side?: string }>)[],
  workoutNames: ReadonlyMap<string, string>,
): RepsAtLoadGroup[] {
  return groupRepSets(rows.filter((row) => samePairValue(row, (s) => s.addedLoadKg)).map((row) => ({
    workoutId: row.workoutId, workoutName: workoutNames.get(row.workoutId) ?? '',
    startedAt: row.workoutStartedAt, loadKg: row.addedLoadKg, reps: row.reps,
  })));
}

/** Reuse the explorer's completed working sets and its existing exercise filters. */
export function repsAtLoadFromExplore(data: ExploreData, scope: Scope): RepsAtLoadGroup[] {
  if (!scope.exerciseId) return [];
  const workouts = new Map(data.workouts.map((workout) => [workout.id, workout]));
  return groupRepSets(aggregatePairs(data.rows).filter((row) => matchesScope(row, scope) && samePairValue(row, (s) => s.addedLoadKg) && (row.metric === 'reps' || row.metric === 'reps_load')).map((row) => ({
    workoutId: row.workoutId, workoutName: workouts.get(row.workoutId)?.name ?? row.exerciseName,
    startedAt: row.workoutStartedAt, loadKg: row.addedLoadKg, reps: row.reps,
  })));
}
