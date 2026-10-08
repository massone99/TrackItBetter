import { netLoadKg } from '../../domain/strengthEstimates';
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
  /** The signed net load: added weight, zero, or help (added load minus the kg of help from bands). */
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

type LoadFields = { addedLoadKg: number; assistKg?: number | null; bandCount?: number };

/** Net load of a set; null when bands helped but their kg are unknown (such sets cannot be placed on the load ladder). */
const netOf = (set: LoadFields) => netLoadKg(set.addedLoadKg, set.assistKg, set.bandCount);
const sameNet = (set: { pairMembers?: readonly LoadFields[] } & LoadFields) =>
  samePairValue(set as { pairMembers?: readonly LoadFields[] } & LoadFields, (side) => netOf(side as LoadFields));

/** The exercise page already loads completed history, including warm-ups that we omit here. */
export function repsAtLoadFromHistory(history: readonly ExerciseHistorySession[]): RepsAtLoadGroup[] {
  return groupRepSets(history.flatMap((session) => aggregatePairs(session.sets).filter((set) => set.kind === 'working' && sameNet(set)).flatMap((set) => {
    const loadKg = netOf(set);
    return loadKg === null ? [] : [{ workoutId: session.workoutId, workoutName: session.workoutName, startedAt: session.startedAt, loadKg, reps: set.reps }];
  })));
}

type RowFields = LoadFields & { workoutId: string; workoutStartedAt: Date; reps: number | null; pairId?: string | null; side?: string };

/** Completed working sets of one exercise, already scoped to a side view (see `aggregatePairs`). */
export function repsAtLoadFromRows(rows: readonly Aggregated<RowFields>[], workoutNames: ReadonlyMap<string, string>): RepsAtLoadGroup[] {
  return groupRepSets(rows.filter(sameNet).flatMap((row) => {
    const loadKg = netOf(row);
    return loadKg === null ? [] : [{ workoutId: row.workoutId, workoutName: workoutNames.get(row.workoutId) ?? '', startedAt: row.workoutStartedAt, loadKg, reps: row.reps }];
  }));
}

/** Reuse the explorer's completed working sets and its existing exercise filters. */
export function repsAtLoadFromExplore(data: ExploreData, scope: Scope): RepsAtLoadGroup[] {
  if (!scope.exerciseId) return [];
  const workouts = new Map(data.workouts.map((workout) => [workout.id, workout]));
  return groupRepSets(aggregatePairs(data.rows).filter((row) => matchesScope(row, scope) && sameNet(row) && (row.metric === 'reps' || row.metric === 'reps_load')).flatMap((row) => {
    const loadKg = netOf(row);
    return loadKg === null ? [] : [{ workoutId: row.workoutId, workoutName: workouts.get(row.workoutId)?.name ?? row.exerciseName, startedAt: row.workoutStartedAt, loadKg, reps: row.reps }];
  }));
}
