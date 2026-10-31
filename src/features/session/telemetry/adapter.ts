import type { ExerciseHistorySession } from '../../analytics/repository';
import type { SessionExercise } from '../repository';
import type { TelemetryHistorySession, TelemetrySet } from './derive';

/** Sessions on the same apparatus when it changes the difficulty; history of another apparatus is never a baseline. */
export function comparableHistory(sessions: readonly ExerciseHistorySession[], exercise: Pick<SessionExercise, 'apparatusAffectsDifficulty' | 'apparatusId'>): TelemetryHistorySession[] {
  const strict = Boolean(exercise.apparatusAffectsDifficulty);
  return sessions
    .filter((session) => !strict || session.apparatusId === (exercise.apparatusId ?? null))
    .map((session) => ({
      workoutId: session.workoutId,
      sets: session.sets.filter((set) => set.kind === 'working' || set.kind === 'warmup').map((set): TelemetrySet => ({
        id: set.id, kind: set.kind as 'working' | 'warmup', completedAt: session.startedAt, reps: set.reps, durationSec: set.durationSec, distanceM: set.distanceM,
        addedLoadKg: set.addedLoadKg, assistKg: set.assistKg ?? null, bands: set.bands ?? [], rpe: set.rpe, formRating: set.formRating ?? null, romRating: set.romRating ?? null,
        pairId: set.pairId, side: set.side,
      })),
    }));
}

/** The set the telemetry is about: the one in hand, else the one just done (still to rate). */
export function activeSetOf(exercise: Pick<SessionExercise, 'sets'>): string | null {
  const open = exercise.sets.find((set) => !set.completedAt && set.kind === 'working');
  if (open) return open.id;
  return [...exercise.sets].reverse().find((set) => set.completedAt && set.kind === 'working')?.id ?? null;
}
