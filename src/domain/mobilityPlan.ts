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
  /** Countdown before every drill starts, so there is time to get into position. */
  prepSec?: number;
  steps: MobilityStep[];
}

export type MobilitySegment =
  | { kind: 'work'; stepIndex: number; round: number; side: MobilitySide | null; mode: MobilityMode; durationSec: number | null; reps: number | null }
  | { kind: 'switch' | 'rest' | 'transition' | 'prep'; stepIndex: number; durationSec: number };

/** Seconds the side switch takes when a drill is done per side. */
export const SIDE_SWITCH_SEC = 5;
/** Default countdown before each drill. */
export const DEFAULT_PREP_SEC = 5;
/** Rough time per rep, only used to estimate a routine's length. */
export const ESTIMATED_SEC_PER_REP = 3;

/**
 * Expands a routine into the ordered segments the guided player walks through. `stepIndex` on
 * rest/switch/transition/prep segments points at the drill that comes next. With `prepSec`, every
 * drill is preceded by a countdown of at least that long: a switch, rest or transition right before
 * it is stretched to fit, otherwise a `prep` segment is added.
 */
export function expandRoutine(routine: MobilityRoutineShape): MobilitySegment[] {
  const prepSec = Math.max(0, Math.round(routine.prepSec ?? 0));
  const segments = expandWork(routine);
  if (prepSec === 0) return segments;
  const withPrep: MobilitySegment[] = [];
  for (const segment of segments) {
    const before = withPrep[withPrep.length - 1];
    if (segment.kind === 'work') {
      if (before && before.kind !== 'work') before.durationSec = Math.max(before.durationSec, prepSec);
      else withPrep.push({ kind: 'prep', stepIndex: segment.stepIndex, durationSec: prepSec });
    }
    withPrep.push(segment);
  }
  return withPrep;
}

function expandWork(routine: MobilityRoutineShape): MobilitySegment[] {
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
