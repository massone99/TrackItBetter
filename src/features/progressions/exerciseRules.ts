import { eq } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { settings } from '../../db/schema';
import {
  DEFAULT_EXERCISE_RULE,
  isCustomRule,
  sanitizeExerciseRule,
  type ExerciseProgressionRule,
} from '../../domain/progressionMethods';

/** Per-exercise progression rules kept as one JSON setting (included automatically in backups). */
const KEY = 'exercise_progression_rules_v1';

export type ExerciseRuleMap = Map<string, ExerciseProgressionRule>;

export function parseExerciseRules(raw: unknown): ExerciseRuleMap {
  const result: ExerciseRuleMap = new Map();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [exerciseId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!exerciseId) continue;
    const rule = sanitizeExerciseRule(value);
    if (rule && isCustomRule(rule)) result.set(exerciseId, rule);
  }
  return result;
}

export async function getAllExerciseRules(): Promise<ExerciseRuleMap> {
  await initializeDatabase();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return new Map();
  try {
    return parseExerciseRules(JSON.parse(row.value));
  } catch {
    return new Map();
  }
}

export async function getExerciseRule(exerciseId: string): Promise<ExerciseProgressionRule> {
  const all = await getAllExerciseRules();
  return all.get(exerciseId) ?? DEFAULT_EXERCISE_RULE;
}

async function writeAllExerciseRules(map: ExerciseRuleMap): Promise<void> {
  const serialized = JSON.stringify(Object.fromEntries(map));
  await db
    .insert(settings)
    .values({ key: KEY, value: serialized })
    .onConflictDoUpdate({ target: settings.key, set: { value: serialized } });
}

/** Saves (or resets when default) the progression rule for one exercise. */
export async function saveExerciseRule(exerciseId: string, rule: ExerciseProgressionRule): Promise<ExerciseProgressionRule> {
  await initializeDatabase();
  const all = await getAllExerciseRules();
  const clean = sanitizeExerciseRule(rule) ?? DEFAULT_EXERCISE_RULE;
  if (isCustomRule(clean)) all.set(exerciseId, clean);
  else all.delete(exerciseId);
  await writeAllExerciseRules(all);
  return clean;
}

export async function clearExerciseRule(exerciseId: string): Promise<void> {
  await saveExerciseRule(exerciseId, DEFAULT_EXERCISE_RULE);
}
