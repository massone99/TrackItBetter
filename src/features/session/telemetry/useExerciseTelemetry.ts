import { useEffect, useMemo, useState } from 'react';
import { cachedUntilHistoryChange } from '../../../db/cache';
import { getExerciseHistory, type ExerciseHistorySession } from '../../analytics/repository';
import type { RecordKind } from '../../analytics/records';
import type { SessionExercise } from '../repository';
import { activeSetOf, comparableHistory } from './adapter';
import { deriveExerciseTelemetry, type ExerciseTelemetry, type Metric } from './derive';

/** Finished history of one exercise, reloaded only after a finished workout changes. */
const loaders = new Map<string, () => Promise<ExerciseHistorySession[]>>();
function loadHistory(exerciseId: string): Promise<ExerciseHistorySession[]> {
  let load = loaders.get(exerciseId);
  if (!load) { load = cachedUntilHistoryChange(() => getExerciseHistory(exerciseId)); loaders.set(exerciseId, load); }
  return load();
}

export interface TelemetryView {
  telemetry: ExerciseTelemetry;
  /** Finished sessions behind the baseline (at most five count). */
  sessions: number;
  usesBands: boolean;
}

/** Live telemetry of one exercise against its comparable history; null while the history loads. */
export function useExerciseTelemetry(exercise: SessionExercise | null, records: ReadonlyMap<string, RecordKind[]>): TelemetryView | null {
  const exerciseId = exercise?.exerciseId ?? null;
  const [loaded, setLoaded] = useState<{ exerciseId: string; sessions: ExerciseHistorySession[] } | null>(null);
  useEffect(() => {
    if (!exerciseId) return;
    let alive = true;
    loadHistory(exerciseId).then((sessions) => { if (alive) setLoaded({ exerciseId, sessions }); }, () => { if (alive) setLoaded({ exerciseId, sessions: [] }); });
    return () => { alive = false; };
  }, [exerciseId]);
  const sessions = loaded && loaded.exerciseId === exerciseId ? loaded.sessions : null;
  const apparatusAffects = exercise?.apparatusAffectsDifficulty;
  const apparatusId = exercise?.apparatusId;
  const history = useMemo(() => sessions ? comparableHistory(sessions, { apparatusAffectsDifficulty: apparatusAffects, apparatusId }) : null, [sessions, apparatusAffects, apparatusId]);
  return useMemo(() => {
    if (!exercise || !history) return null;
    const confirmed = new Set<string>();
    for (const [setId, kinds] of records) if (kinds.some((kind) => kind === 'repsAtLoad' || kind === 'holdAtLoad')) confirmed.add(setId);
    const usesBands = exercise.sets.some((set) => set.bands.length > 0) || history.some((session) => session.sets.some((set) => set.bands.length > 0));
    const telemetry = deriveExerciseTelemetry({
      metric: exercise.metric as Metric, currentSets: exercise.sets, activeSetId: activeSetOf(exercise), history, usesBands, confirmedRecordSetIds: confirmed,
    });
    return { telemetry, sessions: Math.min(5, history.length), usesBands };
  }, [exercise, history, records]);
}
