import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { db, initializeDatabase } from '../../db/client';
import { settings } from '../../db/schema';
import { DEFAULT_PREP_SEC, type MobilityStep } from '../../domain/mobilityPlan';

export interface MobilityRoutine {
  id: string;
  name: string;
  /** Seconds to get into the next drill. */
  transitionSec: number;
  /** Countdown before every drill starts. */
  prepSec: number;
  steps: MobilityStep[];
  updatedAt: string;
}

const KEY = 'mobility_routines_v1';

const stepSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  mode: z.enum(['hold', 'reps']),
  seconds: z.number().int().min(5).max(600),
  reps: z.number().int().min(1).max(100),
  perSide: z.boolean(),
  rounds: z.number().int().min(1).max(10),
  restSec: z.number().int().min(0).max(300),
});

const routineSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  transitionSec: z.number().int().min(0).max(60),
  // Routines saved before the countdown existed get the default one.
  prepSec: z.number().int().min(0).max(30).default(DEFAULT_PREP_SEC),
  steps: z.array(stepSchema).min(1).max(40),
  updatedAt: z.string(),
});

export function newStep(exerciseId: string, mode: MobilityStep['mode']): MobilityStep {
  return { id: Crypto.randomUUID(), exerciseId, mode, seconds: 45, reps: 10, perSide: false, rounds: 1, restSec: 0 };
}

export async function listMobilityRoutines(): Promise<MobilityRoutine[]> {
  await initializeDatabase();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    // Invalid entries (e.g. from a hand-edited backup) are skipped rather than breaking the list.
    return parsed.flatMap((item) => {
      const result = routineSchema.safeParse(item);
      return result.success ? [result.data] : [];
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function getMobilityRoutine(id: string): Promise<MobilityRoutine | null> {
  return (await listMobilityRoutines()).find((routine) => routine.id === id) ?? null;
}

/** Validates and stores a routine; throws a ZodError when it is incomplete. */
export async function saveMobilityRoutine(input: Omit<MobilityRoutine, 'id' | 'updatedAt'> & { id?: string }): Promise<MobilityRoutine> {
  const routine = routineSchema.parse({ ...input, id: input.id ?? Crypto.randomUUID(), updatedAt: new Date().toISOString() });
  const others = (await listMobilityRoutines()).filter((item) => item.id !== routine.id);
  await writeAll([routine, ...others]);
  return routine;
}

export async function deleteMobilityRoutine(id: string): Promise<void> {
  await writeAll((await listMobilityRoutines()).filter((item) => item.id !== id));
}

async function writeAll(routines: MobilityRoutine[]): Promise<void> {
  await initializeDatabase();
  if (routines.length === 0) {
    await db.delete(settings).where(eq(settings.key, KEY));
    return;
  }
  const value = JSON.stringify(routines);
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
