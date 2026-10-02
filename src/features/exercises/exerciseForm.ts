import { z } from 'zod';
import { normalizeVideoUrl } from '../../shared/utils/url';
import { EXERCISE_CATEGORIES, type ExerciseCategory } from './categories';
import type { CreateCustomExerciseInput, ExerciseMetric } from './customRepository';
import { MOBILITY_MODES, mobilityModeFor } from './mobilityMode';
import { MOVEMENT_GROUP_IDS, MOVEMENT_TAGS, exerciseMovementTags, normalizeMovementTags, type MovementGroupId } from './movementCatalog';

export { EXERCISE_CATEGORIES };
export const EXERCISE_METRICS = ['reps', 'time', 'reps_load', 'time_load', 'distance'] as const satisfies readonly ExerciseMetric[];

export const exerciseFormSchema = z.object({
  name: z.string().trim().min(1, 'customExercise.errors.name').max(80, 'customExercise.errors.nameLength'),
  metric: z.enum(EXERCISE_METRICS),
  // Optional in the input so older fixtures and callers continue to validate;
  // every parsed form receives an explicit default for saving.
  unilateral: z.boolean().optional().default(false),
  category: z.enum(EXERCISE_CATEGORIES),
  extraCategories: z.array(z.enum(EXERCISE_CATEGORIES)),
  equipment: z.string().max(240, 'customExercise.errors.equipmentLength'),
  cues: z.string().max(1000, 'customExercise.errors.cuesLength'),
  demoUrl: z.string().refine((value) => normalizeVideoUrl(value) !== undefined, 'logger.referenceInvalid'),
  movementTag: z.string().nullable(),
  movementTags: z.array(z.string()).optional(),
  movementGroup: z.enum(MOVEMENT_GROUP_IDS as unknown as [MovementGroupId, ...MovementGroupId[]]).nullable(),
  mobilityMode: z.enum(MOBILITY_MODES).nullable().optional(),
});

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;
/** Input shape accepted by the resolver; defaults are applied in its output. */
export type ExerciseFormInput = z.input<typeof exerciseFormSchema>;

export const EMPTY_EXERCISE_FORM: ExerciseFormValues = {
  name: '', metric: 'reps', unilateral: false, category: 'push', extraCategories: [], equipment: '', cues: '', demoUrl: '', movementTag: null, movementGroup: null, mobilityMode: null,
};

export interface StoredExercise {
  name: string;
  metric: string;
  unilateral?: boolean | null;
  category: string;
  extraCategories: string;
  equipment: string;
  cues: string;
  demoUrl: string | null;
  movementTag: string | null;
  movementTags?: string | null;
  movementGroup: string | null;
  mobilityMode?: string | null;
}

function readList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function splitList(value: string, commaSeparated = false): string[] {
  return value.split(commaSeparated ? /[\n,]/ : /\n/).map((item) => item.trim()).filter(Boolean);
}

const isCategory = (value: string): value is ExerciseCategory => (EXERCISE_CATEGORIES as readonly string[]).includes(value);

/**
 * Form values for an exercise read from the database. Anything the form cannot show (an old
 * category, a movement group or tag no longer in the catalog) is dropped, so saving never fails
 * validation on a value the user cannot see or change.
 */
export function exerciseToFormValues(exercise: StoredExercise): ExerciseFormValues {
  const extras = [...new Set(readList(exercise.extraCategories).filter(isCategory))];
  const category = isCategory(exercise.category) ? exercise.category : extras[0] ?? 'push';
  const tags = exerciseMovementTags(exercise).filter((tag) => (MOVEMENT_TAGS as readonly string[]).includes(tag));
  return {
    name: exercise.name,
    metric: (EXERCISE_METRICS as readonly string[]).includes(exercise.metric) ? exercise.metric as ExerciseMetric : 'reps',
    unilateral: exercise.unilateral === true,
    category,
    extraCategories: extras.filter((item) => item !== category),
    equipment: readList(exercise.equipment).join(', '),
    cues: readList(exercise.cues).join('\n'),
    demoUrl: exercise.demoUrl ?? '',
    movementTag: tags[0] ?? null,
    movementTags: tags,
    movementGroup: (MOVEMENT_GROUP_IDS as readonly string[]).includes(exercise.movementGroup ?? '') ? exercise.movementGroup as MovementGroupId : null,
    mobilityMode: mobilityModeFor({ category, extraCategories: extras.filter((item) => item !== category) }, exercise.mobilityMode),
  };
}

/** What the repository saves for the submitted form. */
export function formValuesToInput(values: ExerciseFormValues): CreateCustomExerciseInput {
  const tags = normalizeMovementTags(values.movementTags ?? (values.movementTag ? [values.movementTag] : []));
  return {
    name: values.name.trim(),
    metric: values.metric,
    unilateral: values.unilateral === true,
    category: values.category,
    extraCategories: [...new Set(values.extraCategories)].filter((item) => item !== values.category),
    equipment: splitList(values.equipment, true),
    cues: splitList(values.cues),
    demoUrl: normalizeVideoUrl(values.demoUrl) ?? null,
    movementTag: tags[0] ?? null,
    movementTags: tags,
    movementGroup: values.movementGroup,
    mobilityMode: mobilityModeFor(values, values.mobilityMode),
  };
}

/** Picking a new main category; an extra promoted to main leaves the old main as an extra. */
export function chooseMainCategory(values: Pick<ExerciseFormValues, 'category' | 'extraCategories'>, next: ExerciseCategory) {
  if (next === values.category) return values;
  const promoted = values.extraCategories.includes(next);
  const extras = values.extraCategories.filter((item) => item !== next);
  return { category: next, extraCategories: promoted ? [...extras, values.category] : extras };
}

/** Tapping an extra category adds it, or removes it when already chosen. */
export function toggleExtraCategory(extras: ExerciseCategory[], category: ExerciseCategory): ExerciseCategory[] {
  return extras.includes(category) ? extras.filter((item) => item !== category) : [...extras, category];
}
