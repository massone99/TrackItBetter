import exerciseSeed from '../../db/seed/exercises.json';

export const MOVEMENT_GROUPS = [
  { id: 'horizontal-push', label: 'Horizontal push' },
  { id: 'vertical-push', label: 'Vertical push' },
  { id: 'horizontal-pull', label: 'Horizontal pull' },
  { id: 'vertical-pull', label: 'Vertical pull' },
  { id: 'squat', label: 'Squat' },
  { id: 'hinge', label: 'Hinge' },
] as const;

export const MOVEMENT_GROUP_IDS = MOVEMENT_GROUPS.map(({ id }) => id) as readonly MovementGroupId[];
export type MovementGroupId = (typeof MOVEMENT_GROUPS)[number]['id'];

export function canonicalizeMovementTag(tag: string | null | undefined): string | null {
  if (tag == null || tag.trim() === '') return null;
  const normalized = tag.trim().replace(/\s+/g, ' ');
  if (normalized.toLocaleLowerCase() === 'shoulder extension + flexion'.toLocaleLowerCase()) {
    return 'Shoulder extension';
  }
  return normalized;
}

export const normalizeMovementTag = canonicalizeMovementTag;

export const MOVEMENT_TAGS = [
  'Shoulder flexion',
  'Shoulder extension',
  'Shoulder abduction',
  'Shoulder adduction',
  'Shoulder ER',
  'Shoulder IR',
  'Elbow flexion',
  'Elbow extension',
  'Elbow pronation / supination',
  'Wrist flexion',
  'Wrist extension',
  'Wrist deviation',
  'Fingers extension',
  'Fingers flexion',
  'Fingers abduction',
  'Hip flexion',
  'Hip extension',
  'Hip abduction',
  'Hip adduction',
  'Hip ER',
  'Hip IR',
  'Knee flexion',
  'Knee extension',
  'Knee IR',
  'Knee ER',
  'Ankle dorsiflexion',
  'Ankle plantar flexion',
  'Ankle inversion',
  'Ankle eversion',
  'Toes flexion',
  'Toes extension',
  'Toes abduction / adduction',
  'Cervical flexion',
  'Cervical extension',
  'Cervical side flexion (bottom to top)',
  'Cervical side flexion (top to bottom)',
  'Cervical rotation',
  'Thoracic flexion',
  'Thoracic extension',
  'Thoracic side flexion (bottom to top)',
  'Thoracic side flexion (top to bottom)',
  'Thoracic rotation',
  'Lumbar flexion',
  'Lumbar extension',
  'Lumbar side flexion (bottom to top)',
  'Lumbar side flexion (top to bottom)',
  'Lumbar rotation',
  'Spine flexion',
  'Spine extension',
  'Spine side flexion (bottom to top)',
  'Spine side flexion (top to bottom)',
  'Spine rotation',
  // Older tags without a direction: still valid for existing data, no longer offered.
  'Cervical side flexion',
  'Thoracic side flexion',
] as const;

/** Tags kept valid for data saved before their direction was split; not offered when classifying. */
export const LEGACY_MOVEMENT_TAGS = ['Cervical side flexion', 'Thoracic side flexion'] as const;

type SectionTag = Exclude<(typeof MOVEMENT_TAGS)[number], (typeof LEGACY_MOVEMENT_TAGS)[number]>;

/** The tags offered when classifying, grouped by joint or region. Ids match `movement.sections.*`. */
export const MOVEMENT_TAG_SECTIONS: readonly { id: string; tags: readonly SectionTag[] }[] = [
  { id: 'shoulder', tags: ['Shoulder flexion', 'Shoulder extension', 'Shoulder abduction', 'Shoulder adduction', 'Shoulder ER', 'Shoulder IR'] },
  { id: 'elbow', tags: ['Elbow flexion', 'Elbow extension', 'Elbow pronation / supination'] },
  { id: 'wrist', tags: ['Wrist flexion', 'Wrist extension', 'Wrist deviation'] },
  { id: 'fingers', tags: ['Fingers extension', 'Fingers flexion', 'Fingers abduction'] },
  { id: 'hip', tags: ['Hip flexion', 'Hip extension', 'Hip abduction', 'Hip adduction', 'Hip ER', 'Hip IR'] },
  { id: 'knee', tags: ['Knee flexion', 'Knee extension', 'Knee IR', 'Knee ER'] },
  { id: 'ankle', tags: ['Ankle dorsiflexion', 'Ankle plantar flexion', 'Ankle inversion', 'Ankle eversion'] },
  { id: 'toes', tags: ['Toes flexion', 'Toes extension', 'Toes abduction / adduction'] },
  { id: 'cervical', tags: ['Cervical flexion', 'Cervical extension', 'Cervical side flexion (bottom to top)', 'Cervical side flexion (top to bottom)', 'Cervical rotation'] },
  { id: 'thoracic', tags: ['Thoracic flexion', 'Thoracic extension', 'Thoracic side flexion (bottom to top)', 'Thoracic side flexion (top to bottom)', 'Thoracic rotation'] },
  { id: 'lumbar', tags: ['Lumbar flexion', 'Lumbar extension', 'Lumbar side flexion (bottom to top)', 'Lumbar side flexion (top to bottom)', 'Lumbar rotation'] },
  { id: 'spine', tags: ['Spine flexion', 'Spine extension', 'Spine side flexion (bottom to top)', 'Spine side flexion (top to bottom)', 'Spine rotation'] },
];

export type MovementTag = (typeof MOVEMENT_TAGS)[number];

export function seededMovementGroup(
  exercise: Pick<(typeof exerciseSeed)[number], 'id' | 'movementPattern'>,
): MovementGroupId | null {
  if (exercise.id === 'glute-bridge' || exercise.id === 'single-leg-glute-bridge' || exercise.id === 'glute-bridge-progression') {
    return 'hinge';
  }
  if (exercise.movementPattern === 'single-leg-squat') return 'squat';
  // Holds whose catalog pattern names a position, not a push or pull: put them where they train.
  if (exercise.movementPattern === 'inversion' || exercise.movementPattern === 'support-hold') return 'vertical-push';
  if (exercise.movementPattern === 'shoulder-extension') return 'horizontal-pull';
  return MOVEMENT_GROUP_IDS.includes(exercise.movementPattern as MovementGroupId)
    ? exercise.movementPattern as MovementGroupId
    : null;
}

export function normalizeExerciseClassification<T extends {
  id: string;
  movementPattern: string | null;
  movementTag?: string | null;
  movementGroup?: string | null;
}>(exercise: T): T & { movementTag: string | null; movementGroup: string | null } {
  return {
    ...exercise,
    movementTag: canonicalizeMovementTag(exercise.movementTag),
    // Missing means this is a legacy backup. Explicit null means the user cleared it.
    movementGroup: exercise.movementGroup === undefined
      ? seededMovementGroup(exercise as Pick<(typeof exerciseSeed)[number], 'id' | 'movementPattern'>)
      : exercise.movementGroup,
  };
}
