import { SIDE_SWITCH_SEC, type MobilitySegment, type MobilitySide } from './mobilityPlan';
import { groupSets } from './setPairs';

export interface NarrationSet {
  id: string;
  pairId?: string | null;
  side?: string;
  durationSec: number | null;
  reps: number | null;
  /** Rest after this set, already resolved from the set, the exercise and the defaults. */
  restSec: number;
  done: boolean;
}

export interface NarrationExercise {
  entryId: string;
  groupId: string | null;
  groupType: string | null;
  unilateralRestMode?: 'side' | 'pair';
  sets: NarrationSet[];
}

/** Seconds of rest between two exercises of a superset, 0 when the superset only rests after a round. */
function betweenSeconds(groupType: string | null): number {
  const match = /^superset:between:(\d+)$/.exec(groupType ?? '');
  return match ? Number(match[1]) : 0;
}

interface Unit { exerciseIndex: number; sets: NarrationSet[]; setNumber: number; endOfRound: boolean }

/**
 * Order in which the open sets are done: exercises in turn, but a superset goes round by round
 * (A1, B1, A2, B2...). A unilateral pair is one unit with two sides. Completed sets are skipped.
 */
function orderUnits(exercises: readonly NarrationExercise[]): Unit[] {
  const perExercise = exercises.map((exercise) => {
    const all = groupSets(exercise.sets);
    return all.map((sets, position) => ({ sets, setNumber: position + 1 })).filter(({ sets }) => !sets.every((set) => set.done));
  });
  const units: Unit[] = [];
  const doneGroups = new Set<string>();
  exercises.forEach((exercise, exerciseIndex) => {
    const key = exercise.groupId;
    if (!key) {
      perExercise[exerciseIndex].forEach((unit) => units.push({ exerciseIndex, ...unit, endOfRound: true }));
      return;
    }
    if (doneGroups.has(key)) return;
    doneGroups.add(key);
    const members = exercises.map((other, index) => ({ other, index })).filter(({ other }) => other.groupId === key);
    const rounds = Math.max(...members.map(({ index }) => perExercise[index].length));
    for (let round = 0; round < rounds; round += 1) {
      const present = members.filter(({ index }) => perExercise[index][round]);
      present.forEach(({ index }, position) => units.push({ exerciseIndex: index, ...perExercise[index][round], endOfRound: position === present.length - 1 }));
    }
  });
  return units;
}

/**
 * The segments of a hands-free session over a workout's open sets. A preparation of `prepSec` comes
 * before every set and every change of exercise; it is separate from the rest, which follows the
 * set and keeps its own length (`stepIndex` is the index of the exercise in `exercises`).
 */
export function buildNarrationPlan(exercises: readonly NarrationExercise[], prepSec: number): MobilitySegment[] {
  const prep = Math.max(0, Math.round(prepSec));
  const units = orderUnits(exercises);
  const segments: MobilitySegment[] = [];
  units.forEach((unit, position) => {
    const exercise = exercises[unit.exerciseIndex];
    if (prep > 0) segments.push({ kind: 'prep', stepIndex: unit.exerciseIndex, durationSec: prep });
    const sets = [...unit.sets].sort((a, b) => (a.side === 'left' ? -1 : 0) - (b.side === 'left' ? -1 : 0));
    sets.forEach((set, sideIndex) => {
      const hold = set.durationSec != null;
      const side: MobilitySide | null = set.side === 'left' || set.side === 'right' ? set.side : null;
      segments.push({
        kind: 'work',
        stepIndex: unit.exerciseIndex,
        round: unit.setNumber,
        side,
        mode: hold ? 'hold' : 'reps',
        durationSec: hold ? Math.max(1, Math.round(set.durationSec ?? 0)) : null,
        reps: hold ? null : set.reps,
        setIds: [set.id],
      });
      if (sideIndex < sets.length - 1) {
        // The switch is also the preparation for the other side, so it is at least that long.
        if (exercise.unilateralRestMode === 'side' && set.restSec > 0) segments.push({ kind: 'rest', stepIndex: unit.exerciseIndex, durationSec: Math.round(set.restSec) });
        segments.push({ kind: 'switch', stepIndex: unit.exerciseIndex, durationSec: Math.max(SIDE_SWITCH_SEC, prep) });
      }
    });
    const next = units[position + 1];
    if (!next) return;
    const last = sets[sets.length - 1];
    const rest = exercise.groupId && !unit.endOfRound ? betweenSeconds(exercise.groupType) : Math.round(last.restSec);
    if (rest > 0) segments.push({ kind: 'rest', stepIndex: next.exerciseIndex, durationSec: rest });
  });
  return segments;
}
