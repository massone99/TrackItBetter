import { canonicalizeMovementTag, MOVEMENT_TAGS, normalizeExerciseClassification, seededMovementGroup } from '../movementCatalog';
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
