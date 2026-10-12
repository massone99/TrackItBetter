import type { MobilityStep } from './mobilityPlan';

export interface ImportExerciseInfo {
  /** Mobility is one of the exercise's categories. */
  mobility: boolean;
  metric: string;
  unilateral: boolean;
}

/** One prescribed exercise, whatever program (own or built-in) it comes from. */
export interface ImportExercise {
  exerciseId: string;
  sets: number;
  /** Seconds for timed exercises, reps otherwise; null when the program leaves it open. */
  target: number | null;
  restSeconds: number | null;
}

export type ImportCompatibility = 'full' | 'partial' | 'none';

export interface ImportSummary {
  compatibility: ImportCompatibility;
  mobility: number;
  total: number;
}

const DEFAULT_HOLD_SEC = 30;
const DEFAULT_REPS = 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

export function summarizeImport(exercises: readonly ImportExercise[], info: ReadonlyMap<string, ImportExerciseInfo>): ImportSummary {
  const mobility = exercises.filter((exercise) => info.get(exercise.exerciseId)?.mobility).length;
  return { mobility, total: exercises.length, compatibility: mobility === 0 ? 'none' : mobility === exercises.length ? 'full' : 'partial' };
}

/**
 * The drills of a routine made from a prescribed workout: only the mobility exercises, in order. Sets
 * become rounds, a timed exercise a hold of its target seconds, any other one reps; the rest after
 * each set carries over, and a unilateral exercise is done on both sides.
 */
export function stepsFromWorkout(exercises: readonly ImportExercise[], info: ReadonlyMap<string, ImportExerciseInfo>, newId: () => string): MobilityStep[] {
  return exercises.flatMap((exercise) => {
    const details = info.get(exercise.exerciseId);
    if (!details?.mobility) return [];
    const timed = details.metric === 'time' || details.metric === 'time_load';
    return [{
      id: newId(),
      exerciseId: exercise.exerciseId,
      mode: timed ? 'hold' : 'reps',
      seconds: clamp(timed ? exercise.target ?? DEFAULT_HOLD_SEC : DEFAULT_HOLD_SEC, 5, 600),
      reps: clamp(timed ? DEFAULT_REPS : exercise.target ?? DEFAULT_REPS, 1, 100),
      perSide: details.unilateral,
      rounds: clamp(exercise.sets, 1, 10),
      restSec: clamp(exercise.restSeconds ?? 0, 0, 300),
    } satisfies MobilityStep];
  });
}

/**
 * A routine's drills as the prescriptions a regular workout is started from: rounds become sets, a
 * hold its seconds, a rep drill its reps, and the rest between rounds carries over.
 */
export function prescriptionsFromSteps(steps: readonly MobilityStep[], newId: () => string): ImportPrescription[] {
  return steps.map((step) => ({
    id: newId(),
    exerciseId: step.exerciseId,
    sets: step.rounds,
    target: step.mode === 'hold' ? step.seconds : step.reps,
    restSeconds: step.restSec,
  }));
}

export interface ImportPrescription {
  id: string;
  exerciseId: string;
  sets: number;
  target: number;
  restSeconds: number;
}
