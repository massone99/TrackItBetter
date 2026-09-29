import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { eq } from 'drizzle-orm';
import { exercises } from '../../db/schema';
import { canonicalizeMovementTag, MOVEMENT_GROUP_IDS, MOVEMENT_TAGS, type MovementGroupId } from './movementCatalog';

export type ExerciseMetric = 'reps' | 'time' | 'reps_load' | 'time_load' | 'distance';
export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'skill' | 'mobility' | 'cardio';

export interface CreateCustomExerciseInput {
  name: string;
  metric: ExerciseMetric;
  category: ExerciseCategory;
  /** Categories the exercise also belongs to, besides the main one. */
  extraCategories?: ExerciseCategory[];
  equipment: string[];
  cues: string[];
  demoUrl?: string | null;
  movementTag?: string | null;
  movementGroup?: MovementGroupId | null;
}

/** Save a user-created movement in the local exercise catalog. */
export async function createCustomExercise(input: CreateCustomExerciseInput): Promise<string> {
  const movementTag = canonicalizeMovementTag(input.movementTag);
  if (movementTag !== null && !(MOVEMENT_TAGS as readonly string[]).includes(movementTag)) throw new RangeError('Unknown movement tag');
  if (input.movementGroup != null && !(MOVEMENT_GROUP_IDS as readonly string[]).includes(input.movementGroup)) throw new RangeError('Unknown movement group');
  await initializeDatabase();
  const id = Crypto.randomUUID();

  await db.insert(exercises).values({
    id,
    name: input.name.trim(),
    aliases: '[]',
    metric: input.metric,
    category: input.category,
    extraCategories: JSON.stringify(input.extraCategories ?? []),
    primaryMuscles: '[]',
    secondaryMuscles: '[]',
    equipment: JSON.stringify(input.equipment),
    cues: JSON.stringify(input.cues),
    demoUrl: input.demoUrl ?? null,
    movementTag,
    movementGroup: input.movementGroup ?? null,
    isCustom: true,
    createdAt: new Date(),
  });

  return id;
}

/**
 * Edit any exercise, catalog or custom. Past sets reference the exercise by id and keep
 * reps, time, distance and load separately, so history, records and charts follow the new
 * definition without rewriting old rows.
 */
export async function updateExercise(id: string, input: CreateCustomExerciseInput): Promise<void> {
  const movementTag = canonicalizeMovementTag(input.movementTag);
  if (movementTag !== null && !(MOVEMENT_TAGS as readonly string[]).includes(movementTag)) throw new RangeError('Unknown movement tag');
  if (input.movementGroup != null && !(MOVEMENT_GROUP_IDS as readonly string[]).includes(input.movementGroup)) throw new RangeError('Unknown movement group');
  await initializeDatabase();
  await db.update(exercises).set({
    name: input.name.trim(),
    metric: input.metric,
    category: input.category,
    extraCategories: JSON.stringify(input.extraCategories ?? []),
    equipment: JSON.stringify(input.equipment),
    cues: JSON.stringify(input.cues),
    demoUrl: input.demoUrl ?? null,
    movementTag,
    movementGroup: input.movementGroup ?? null,
  }).where(eq(exercises.id, id));
}
