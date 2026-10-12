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
  favourite: boolean;
  /** When a run of this routine was last saved; absent for a routine never run (or run before this was kept). */
  lastDoneAt?: string;
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
  favourite: z.boolean().default(false),
  lastDoneAt: z.string().optional(),
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
export async function saveMobilityRoutine(input: Omit<MobilityRoutine, 'id' | 'updatedAt' | 'favourite' | 'lastDoneAt'> & { id?: string; favourite?: boolean; lastDoneAt?: string }): Promise<MobilityRoutine> {
  const all = await listMobilityRoutines();
  const previous = all.find((item) => item.id === input.id);
  // Editing keeps what the editor does not know about: the favourite star and the last run.
  const routine = routineSchema.parse({ ...input, favourite: input.favourite ?? previous?.favourite ?? false, lastDoneAt: input.lastDoneAt ?? previous?.lastDoneAt, id: input.id ?? Crypto.randomUUID(), updatedAt: new Date().toISOString() });
  const others = all.filter((item) => item.id !== routine.id);
  await writeAll([routine, ...others]);
  return routine;
}

/** Stars or unstars a routine without touching its order in the list. */
export async function setMobilityFavourite(id: string, favourite: boolean): Promise<void> {
  const all = await listMobilityRoutines();
  await writeAll(all.map((routine) => (routine.id === id ? { ...routine, favourite } : routine)));
}

/** Remembers a finished run, without changing the routine's position in the list. */
export async function markMobilityRoutineDone(id: string, at: Date): Promise<void> {
  const all = await listMobilityRoutines();
  await writeAll(all.map((routine) => (routine.id === id ? { ...routine, lastDoneAt: at.toISOString() } : routine)));
}

/** A copy of a routine under a new name, with fresh ids. */
export async function duplicateMobilityRoutine(id: string, name: string): Promise<MobilityRoutine | null> {
  const source = await getMobilityRoutine(id);
  if (!source) return null;
  return saveMobilityRoutine({
    name,
    transitionSec: source.transitionSec,
    prepSec: source.prepSec,
    steps: source.steps.map((step) => ({ ...step, id: Crypto.randomUUID() })),
  });
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
