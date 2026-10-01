import { EXERCISE_CATEGORIES } from './categories';
import { exerciseMovementTags, MOVEMENT_GROUP_IDS, MOVEMENT_TAGS } from './movementCatalog';

export const GROUPING_DIMENSIONS = ['category', 'group', 'tag'] as const;
export type ExerciseGroupingDimension = (typeof GROUPING_DIMENSIONS)[number];
export type ExerciseGrouping = Record<ExerciseGroupingDimension, boolean>;
export const DEFAULT_EXERCISE_GROUPING: ExerciseGrouping = { category: true, group: true, tag: true };
export const UNCLASSIFIED_EXERCISE_GROUP = '__none__';

export interface ExerciseGroupKey { dimension: ExerciseGroupingDimension; value: string }
export interface ExerciseGroupingItem {
  id: string;
  name: string;
  category: string;
  movementGroup?: string | null;
  movementTag?: string | null;
  movementTags?: string | null;
}
export interface ExerciseListSection<T> { id: string; path: ExerciseGroupKey[]; items: T[] }

function valuesFor(exercise: ExerciseGroupingItem, dimension: ExerciseGroupingDimension): string[] {
  if (dimension === 'category') return [exercise.category];
  if (dimension === 'group') {
    return [(MOVEMENT_GROUP_IDS as readonly string[]).includes(exercise.movementGroup ?? '')
      ? exercise.movementGroup! : UNCLASSIFIED_EXERCISE_GROUP];
  }
  const tags = exerciseMovementTags(exercise);
  return tags.length ? tags : [UNCLASSIFIED_EXERCISE_GROUP];
}

const ordering: Record<ExerciseGroupingDimension, readonly string[]> = {
  category: EXERCISE_CATEGORIES, group: MOVEMENT_GROUP_IDS, tag: MOVEMENT_TAGS,
};

function compareKeys(a: ExerciseGroupKey, b: ExerciseGroupKey): number {
  if (a.value === b.value) return 0;
  if (a.value === UNCLASSIFIED_EXERCISE_GROUP) return 1;
  if (b.value === UNCLASSIFIED_EXERCISE_GROUP) return -1;
  const order = ordering[a.dimension];
  const rank = (value: string) => { const index = order.indexOf(value); return index < 0 ? order.length : index; };
  return rank(a.value) - rank(b.value) || a.value.localeCompare(b.value);
}

/** Selected levels nest in category/group/tag order. No levels gives one alphabetical list. */
export function groupExercises<T extends ExerciseGroupingItem>(items: readonly T[], grouping: ExerciseGrouping): ExerciseListSection<T>[] {
  const dimensions = GROUPING_DIMENSIONS.filter((dimension) => grouping[dimension]);
  const sections = new Map<string, ExerciseListSection<T>>();
  for (const exercise of items) {
    let paths: ExerciseGroupKey[][] = [[]];
    for (const dimension of dimensions) {
      paths = paths.flatMap((path) => valuesFor(exercise, dimension).map((value) => [...path, { dimension, value }]));
    }
    for (const path of paths) {
      const id = JSON.stringify(path);
      const section = sections.get(id);
      if (section) section.items.push(exercise);
      else sections.set(id, { id, path, items: [exercise] });
    }
  }
  return [...sections.values()].sort((a, b) => {
    for (let index = 0; index < a.path.length; index += 1) {
      const compared = compareKeys(a.path[index], b.path[index]);
      if (compared) return compared;
    }
    return 0;
  }).map((section) => ({ ...section, items: section.items.sort((a, b) => a.name.localeCompare(b.name)) }));
}
