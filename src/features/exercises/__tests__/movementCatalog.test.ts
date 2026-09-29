import { canonicalizeMovementTag, LEGACY_MOVEMENT_TAGS, MOVEMENT_TAG_SECTIONS, MOVEMENT_TAGS, normalizeExerciseClassification, seededMovementGroup } from '../movementCatalog';
import exerciseSeed from '../../../db/seed/exercises.json';

describe('movement catalog', () => {
  it('canonicalizes the combined shoulder tag and preserves lumbar directions', () => {
    expect(canonicalizeMovementTag('Shoulder extension + flexion')).toBe('Shoulder extension');
    expect(MOVEMENT_TAGS).toContain('Lumbar side flexion (bottom to top)');
    expect(MOVEMENT_TAGS).toContain('Lumbar side flexion (top to bottom)');
    expect(new Set(MOVEMENT_TAGS).size).toBe(MOVEMENT_TAGS.length);
  });

  it('maps seeded single leg squats and only clear bridge hinges', () => {
    const find = (id: string) => exerciseSeed.find((exercise) => exercise.id === id)!;
    expect(seededMovementGroup(find('pistol-squat'))).toBe('squat');
    expect(seededMovementGroup(find('glute-bridge'))).toBe('hinge');
    expect(seededMovementGroup(find('reverse-plank'))).toBeNull();
  });

  it('puts handstands, back levers and support holds in the group they train, and leaves human flags out', () => {
    const find = (id: string) => exerciseSeed.find((exercise) => exercise.id === id)!;
    expect(seededMovementGroup(find('freestanding-handstand-hold'))).toBe('vertical-push');
    expect(seededMovementGroup(find('pike-handstand-hold'))).toBe('vertical-push');
    expect(seededMovementGroup(find('tuck-back-lever'))).toBe('horizontal-pull');
    expect(seededMovementGroup(find('full-back-lever'))).toBe('horizontal-pull');
    expect(seededMovementGroup(find('v-sit'))).toBe('vertical-push');
    expect(seededMovementGroup(find('full-human-flag'))).toBeNull();
  });

  it('gives every hold of a pushing or pulling skill a matching extra category in the catalog', () => {
    const find = (id: string) => exerciseSeed.find((exercise) => exercise.id === id) as { extraCategories?: string[] };
    expect(find('freestanding-handstand-hold').extraCategories).toEqual(['push']);
    expect(find('tuck-back-lever').extraCategories).toEqual(['pull']);
    expect(find('one-leg-l-sit').extraCategories).toEqual(['push']);
    expect(find('full-human-flag').extraCategories).toBeUndefined();
  });

  it('infers classifications only when legacy fields are absent', () => {
    expect(normalizeExerciseClassification({ id: 'split-squat', movementPattern: 'single-leg-squat' }))
      .toMatchObject({ movementTag: null, movementGroup: 'squat' });
    expect(normalizeExerciseClassification({ id: 'push-up', movementPattern: 'horizontal-push', movementGroup: null }))
      .toMatchObject({ movementGroup: null });
  });

  it('canonicalizes the shoulder alias during backup row normalization', () => {
    expect(normalizeExerciseClassification({
      id: 'shoulder-extension',
      movementPattern: 'shoulder-extension',
      movementTag: 'Shoulder extension + flexion',
    })).toMatchObject({ movementTag: 'Shoulder extension' });
  });
});

describe('movement tag sections', () => {
  it('has both side-flexion directions for every part of the spine, plus whole-spine tags', () => {
    for (const region of ['Cervical', 'Thoracic', 'Lumbar', 'Spine']) {
      expect(MOVEMENT_TAGS).toContain(`${region} side flexion (bottom to top)`);
      expect(MOVEMENT_TAGS).toContain(`${region} side flexion (top to bottom)`);
    }
    for (const tag of ['Spine flexion', 'Spine extension', 'Spine rotation']) expect(MOVEMENT_TAGS).toContain(tag);
  });

  it('lists every current tag in exactly one section, and only legacy tags stay out', () => {
    const listed = MOVEMENT_TAG_SECTIONS.flatMap((section) => [...section.tags]);
    expect(new Set(listed).size).toBe(listed.length);
    const unlisted = MOVEMENT_TAGS.filter((tag) => !(listed as string[]).includes(tag));
    expect(unlisted).toEqual([...LEGACY_MOVEMENT_TAGS]);
    expect(listed.every((tag) => (MOVEMENT_TAGS as readonly string[]).includes(tag))).toBe(true);
  });

  it('keeps the old undirected side-flexion tags valid for existing data', () => {
    expect(MOVEMENT_TAGS).toContain('Cervical side flexion');
    expect(MOVEMENT_TAGS).toContain('Thoracic side flexion');
  });
});
