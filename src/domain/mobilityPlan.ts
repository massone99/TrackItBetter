export type MobilityMode = 'hold' | 'reps';
export type MobilitySide = 'left' | 'right';

export interface MobilityStep {
  id: string;
  exerciseId: string;
  mode: MobilityMode;
  /** Hold length per side and round (hold mode). */
  seconds: number;
  /** Reps per side and round (reps mode). */
  reps: number;
  perSide: boolean;
  rounds: number;
  /** Rest after each round except the last. */
  restSec: number;
}

export interface MobilityRoutineShape {
  transitionSec: number;
  steps: MobilityStep[];
}

export type MobilitySegment =
  | { kind: 'work'; stepIndex: number; round: number; side: MobilitySide | null; mode: MobilityMode; durationSec: number | null; reps: number | null }
  | { kind: 'switch' | 'rest' | 'transition'; stepIndex: number; durationSec: number };

/** Seconds the side switch takes when a drill is done per side. */
export const SIDE_SWITCH_SEC = 5;
/** Rough time per rep, only used to estimate a routine's length. */
export const ESTIMATED_SEC_PER_REP = 3;

/**
 * Expands a routine into the ordered segments the guided player walks through. `stepIndex` on
 * rest/switch/transition segments points at the drill that comes next.
 */
export function expandRoutine(routine: MobilityRoutineShape): MobilitySegment[] {
  const segments: MobilitySegment[] = [];
  routine.steps.forEach((step, stepIndex) => {
    const rounds = Math.max(1, Math.floor(step.rounds));
    for (let round = 1; round <= rounds; round += 1) {
      const sides: (MobilitySide | null)[] = step.perSide ? ['left', 'right'] : [null];
      sides.forEach((side, sideIndex) => {
        segments.push({
          kind: 'work',
          stepIndex,
          round,
          side,
          mode: step.mode,
          durationSec: step.mode === 'hold' ? Math.max(1, Math.round(step.seconds)) : null,
          reps: step.mode === 'reps' ? Math.max(1, Math.round(step.reps)) : null,
        });
        if (sideIndex < sides.length - 1) segments.push({ kind: 'switch', stepIndex, durationSec: SIDE_SWITCH_SEC });
      });
      if (round < rounds && step.restSec > 0) segments.push({ kind: 'rest', stepIndex, durationSec: Math.round(step.restSec) });
    }
    if (stepIndex < routine.steps.length - 1 && routine.transitionSec > 0) {
      segments.push({ kind: 'transition', stepIndex: stepIndex + 1, durationSec: Math.round(routine.transitionSec) });
    }
  });
  return segments;
}

export function segmentSeconds(segment: MobilitySegment): number {
  if (segment.kind !== 'work') return segment.durationSec;
  return segment.durationSec ?? (segment.reps ?? 0) * ESTIMATED_SEC_PER_REP;
}

/** Estimated total length in seconds (rep-based drills use ESTIMATED_SEC_PER_REP). */
export function estimateRoutineSeconds(routine: MobilityRoutineShape): number {
  return expandRoutine(routine).reduce((total, segment) => total + segmentSeconds(segment), 0);
}
