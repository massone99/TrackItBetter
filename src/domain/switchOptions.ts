import type { ExerciseTree } from './progressionGraph';

/** What the sets of the exercise in hand say: it was too hard (regress), or its target is reached (progress). */
export type SwitchSignal = 'regress' | 'progress' | null;

export type SwitchSet = { kind: 'working' | 'warmup'; completed: boolean; rpe: number | null; targetRpe: number | null };

const TOO_HARD_RPE = 9.5;
const OVER_TARGET = 1.5;

/**
 * Regress when the last working set done was at the limit (RPE 9.5 or more, or 1.5 above its target);
 * otherwise progress when the exercise's target in its chain is reached; otherwise nothing is suggested.
 */
export function switchSignal(sets: readonly SwitchSet[], targetReached: boolean): SwitchSignal {
  const last = [...sets].reverse().find((set) => set.kind === 'working' && set.completed && set.rpe !== null);
  if (last && last.rpe !== null && (last.rpe >= TOO_HARD_RPE || (last.targetRpe !== null && last.rpe >= last.targetRpe + OVER_TARGET))) return 'regress';
  return targetReached ? 'progress' : null;
}

export type SwitchRelation = 'easier' | 'harder' | 'variation' | 'prerequisite';
export type SwitchOption = { id: string; relation: SwitchRelation; depth: number; suggested: boolean };

/** How many steps away an exercise can be and still be offered. */
const MAX_DEPTH = 2;

/**
 * The exercises of an exercise's tree to switch to: the nearest easier and harder ones, variations and
 * prerequisites. The one the signal points to (the nearest easier one when regressing, the nearest harder
 * one when progressing) comes first, marked suggested; the others follow by depth, easier before harder.
 */
export function switchOptions(tree: ExerciseTree, signal: SwitchSignal): SwitchOption[] {
  const options: SwitchOption[] = [
    ...tree.regressions.filter((node) => node.depth <= MAX_DEPTH).map((node): SwitchOption => ({ id: node.id, relation: 'easier', depth: node.depth, suggested: false })),
    ...tree.progressions.filter((node) => node.depth <= MAX_DEPTH).map((node): SwitchOption => ({ id: node.id, relation: 'harder', depth: node.depth, suggested: false })),
    ...tree.variations.map((id): SwitchOption => ({ id, relation: 'variation', depth: 1, suggested: false })),
    ...tree.prerequisites.map((id): SwitchOption => ({ id, relation: 'prerequisite', depth: 1, suggested: false })),
  ];
  const seen = new Set<string>();
  const unique = options.filter((option) => (seen.has(option.id) ? false : (seen.add(option.id), true)));
  const wanted = signal === 'regress' ? 'easier' : signal === 'progress' ? 'harder' : null;
  const pick = wanted ? unique.find((option) => option.relation === wanted && option.depth === 1) : undefined;
  return pick ? [{ ...pick, suggested: true }, ...unique.filter((option) => option !== pick)] : unique;
}
