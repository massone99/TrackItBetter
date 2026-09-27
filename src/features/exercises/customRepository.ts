import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { exercises } from '../../db/schema';

export type ExerciseMetric = 'reps' | 'time' | 'reps_load' | 'time_load' | 'distance';
export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'skill' | 'mobility' | 'cardio';

export interface CreateCustomExerciseInput {
  name: string;
  metric: ExerciseMetric;
  category: ExerciseCategory;
  equipment: string[];
  cues: string[];
  demoUrl?: string | null;
}

/** Save a user-created movement in the local exercise catalog. */
export async function createCustomExercise(input: CreateCustomExerciseInput): Promise<string> {
  await initializeDatabase();
  const id = Crypto.randomUUID();

  await db.insert(exercises).values({
    id,
    name: input.name.trim(),
    aliases: '[]',
    metric: input.metric,
    category: input.category,
    primaryMuscles: '[]',
    secondaryMuscles: '[]',
    equipment: JSON.stringify(input.equipment),
    cues: JSON.stringify(input.cues),
    demoUrl: input.demoUrl ?? null,
    isCustom: true,
    createdAt: new Date(),
  });

  return id;
}
