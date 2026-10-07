import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { bumpFinishedVersion } from '../../db/cache';
import { eq } from 'drizzle-orm';
import { exercises } from '../../db/schema';
import type { ExerciseCategory } from './categories';
import { mobilityModeFor, type MobilityMode } from './mobilityMode';
import { normalizeMovementTags, MOVEMENT_GROUP_IDS, MOVEMENT_TAGS, type MovementGroupId } from './movementCatalog';

export type { ExerciseCategory } from './categories';
export type ExerciseMetric = 'reps' | 'time' | 'reps_load' | 'time_load' | 'distance';

export interface CreateCustomExerciseInput {
  unilateral?: boolean;
  name: string;
  metric: ExerciseMetric;
  category: ExerciseCategory;
  /** Categories the exercise also belongs to, besides the main one. */
  extraCategories?: ExerciseCategory[];
  equipment: string[];
  cues: string[];
  demoUrl?: string | null;
  movementTag?: string | null;
  movementTags?: string[];
  movementGroup?: MovementGroupId | null;
  /** Only kept while mobility is one of the categories. */
  mobilityMode?: MobilityMode | null;
  /** Apparatus it can be done on (global list), the default one, and whether it changes the difficulty. */
  apparatus?: { ids: string[]; defaultId: string | null; affectsDifficulty: boolean };
}

function apparatusFields(input: CreateCustomExerciseInput) {
  if (!input.apparatus) return {};
  const ids = [...new Set(input.apparatus.ids)];
  const defaultId = input.apparatus.defaultId && ids.includes(input.apparatus.defaultId) ? input.apparatus.defaultId : ids[0] ?? null;
  return { apparatusIds: JSON.stringify(ids), defaultApparatusId: defaultId, apparatusAffectsDifficulty: ids.length > 0 && input.apparatus.affectsDifficulty };
}

/** Extra categories without duplicates or the main category itself. */
function cleanExtraCategories(input: Pick<CreateCustomExerciseInput, 'category' | 'extraCategories'>): ExerciseCategory[] {
  return [...new Set(input.extraCategories ?? [])].filter((item) => item !== input.category);
}

function classificationFields(input: CreateCustomExerciseInput) {
  const tags = normalizeMovementTags(input.movementTags ?? (input.movementTag ? [input.movementTag] : []));
  if (tags.some((tag) => !(MOVEMENT_TAGS as readonly string[]).includes(tag))) throw new RangeError('Unknown movement tag');
  if (input.movementGroup != null && !(MOVEMENT_GROUP_IDS as readonly string[]).includes(input.movementGroup)) throw new RangeError('Unknown movement group');
  return { movementTag: tags[0] ?? null, movementTags: JSON.stringify(tags), movementGroup: input.movementGroup ?? null, mobilityMode: mobilityModeFor(input, input.mobilityMode) };
}

/** Save a user-created movement in the local exercise catalog. */
export async function createCustomExercise(input: CreateCustomExerciseInput): Promise<string> {
  const classification = classificationFields(input);
  await initializeDatabase();
  const id = Crypto.randomUUID();

  await db.insert(exercises).values({
    id,
    name: input.name.trim(),
    aliases: '[]',
    metric: input.metric,
    category: input.category,
    extraCategories: JSON.stringify(cleanExtraCategories(input)),
    primaryMuscles: '[]',
    secondaryMuscles: '[]',
    equipment: JSON.stringify(input.equipment),
    cues: JSON.stringify(input.cues),
    demoUrl: input.demoUrl ?? null,
    ...classification,
    ...apparatusFields(input),
    isCustom: true,
    unilateral: input.unilateral ?? false,
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
  const classification = classificationFields(input);
  await initializeDatabase();
  await db.update(exercises).set({
    ...(input.unilateral === undefined ? {} : { unilateral: input.unilateral }),
    name: input.name.trim(),
    metric: input.metric,
    category: input.category,
    extraCategories: JSON.stringify(cleanExtraCategories(input)),
    equipment: JSON.stringify(input.equipment),
    cues: JSON.stringify(input.cues),
    demoUrl: input.demoUrl ?? null,
    ...classification,
    ...apparatusFields(input),
  }).where(eq(exercises.id, id));
  // Name, measure and categories show up in records and statistics of finished workouts.
  bumpFinishedVersion();
}
