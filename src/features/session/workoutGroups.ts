import { BLOCKS, blockOf, type Block } from '../../domain/blocks';
import type { SessionExercise } from './repository';

export type WorkoutGroup = { id: string; name: string | null; block?: Block };
export type WorkoutGroupLayout = { groups: WorkoutGroup[]; supersets: { id: string; name: string }[] };

export function parseWorkoutGroupLayout(json: string | null): WorkoutGroupLayout | null {
  if (!json) return null;
  try {
    const layout: WorkoutGroupLayout = JSON.parse(json);
    if (Array.isArray(layout?.groups) && Array.isArray(layout.supersets)
      && layout.groups.every((group) => typeof group?.id === 'string' && (group.name === null || typeof group.name === 'string'))
      && layout.supersets.every((group) => typeof group?.id === 'string' && typeof group.name === 'string')) return layout;
  } catch { /* Older or malformed data uses the original blocks. */ }
  return null;
}

export function legacyWorkoutGroups(entries: readonly { block: string | null }[]): WorkoutGroup[] {
  return BLOCKS.filter((block) => entries.some((entry) => blockOf(entry.block) === block))
    .map((block) => ({ id: block, block, name: null }));
}

export type WorkoutSection = { group: WorkoutGroup | null; exercises: SessionExercise[] };

export function workoutSections(exercises: SessionExercise[], layout: WorkoutGroupLayout | null | undefined): WorkoutSection[] {
  const groups = layout?.groups ?? legacyWorkoutGroups(exercises);
  const sections = groups.map((group) => ({
    group,
    exercises: exercises.filter((entry) => (layout ? entry.workoutGroupId : entry.block) === group.id),
  }));
  const ungrouped = exercises.filter((entry) => !groups.some((group) => group.id === (layout ? entry.workoutGroupId : entry.block)));
  return [...sections, ...(ungrouped.length ? [{ group: null, exercises: ungrouped }] : [])];
}
