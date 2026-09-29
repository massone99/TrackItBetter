import exercisesSeed from './exercises.json';
import chainsSeed from './progression-chains.json';
import criteriaSeed from './level-criteria.json';
import type { AppDatabase } from '../client';
import type { NewExercise } from '../schema';
import { exercises, levelCriteria, progressionChains } from '../schema';
import { seededMovementGroup } from '../../features/exercises/movementCatalog';

/** Inserts the bundled catalog on first launch and leaves user edits untouched. */
export async function seedCatalogIfEmpty(db: AppDatabase): Promise<void> {
  const [existing] = await db.select({ id: exercises.id }).from(exercises).limit(1);
  if (existing) return;

  await db.transaction(async (transaction) => {
    await transaction.insert(progressionChains).values(
      chainsSeed.map(({ id, name, description, family }) => ({ id, name, description, family })),
    );
    const exerciseRows: NewExercise[] = exercisesSeed.map((exercise) => ({
        ...exercise,
        movementTag: null,
        movementGroup: seededMovementGroup(exercise),
        aliases: JSON.stringify(exercise.aliases),
        extraCategories: JSON.stringify('extraCategories' in exercise ? exercise.extraCategories : []),
        primaryMuscles: JSON.stringify(exercise.primaryMuscles),
        secondaryMuscles: JSON.stringify(exercise.secondaryMuscles),
        equipment: JSON.stringify(exercise.equipment),
        cues: JSON.stringify(exercise.cues),
        createdAt: new Date(),
      })) as NewExercise[];
    for (let start = 0; start < exerciseRows.length; start += 40) {
      await transaction.insert(exercises).values(exerciseRows.slice(start, start + 40));
    }
    await transaction.insert(levelCriteria).values(
      criteriaSeed.map((criterion) => ({
        id: `${criterion.chainId}-${criterion.level}`,
        chainId: criterion.chainId,
        level: criterion.level,
        target: JSON.stringify(criterion.target),
        requiredSessions: criterion.requiredSessions,
      })),
    );
  });
}
