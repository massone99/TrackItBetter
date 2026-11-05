import { groupSets } from '../../domain/setPairs';
import type { SessionExercise } from './repository';

export interface IncompletePair {
  entryId: string;
  name: string;
  /** The set's number in its exercise, as the finish check words it. */
  setNumber: number;
  /** The sides still to do (one for a pair; a pair has two sides). */
  missing: ('left' | 'right')[];
  /** Whether each side is done, for the L / R badges. */
  done: { left: boolean; right: boolean };
}

/** The L/R pairs of a workout with one side done and the other not: each one blocks finishing the workout. */
export function incompletePairs(exercises: readonly SessionExercise[]): IncompletePair[] {
  const result: IncompletePair[] = [];
  for (const exercise of exercises) {
    for (const pair of groupSets(exercise.sets)) {
      if (!pair[0].pairId || !pair.some((set) => set.completedAt) || pair.every((set) => set.completedAt)) continue;
      const side = (which: 'left' | 'right') => pair.find((set) => set.side === which);
      result.push({
        entryId: exercise.entryId,
        name: exercise.name,
        setNumber: pair[0].index,
        missing: (['left', 'right'] as const).filter((which) => side(which) && !side(which)!.completedAt),
        done: { left: Boolean(side('left')?.completedAt), right: Boolean(side('right')?.completedAt) },
      });
    }
  }
  return result;
}
