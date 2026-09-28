import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { settings } from '../../db/schema';
import { isValidPrescription, validateUserProgram, type UserProgram, type UserProgramSession } from '../../domain/userProgram';

export type { UserProgram, UserProgramExercise, UserProgramSession, Weekday } from '../../domain/userProgram';

const KEY = 'user_weekly_programs_v1';

export async function listUserPrograms(): Promise<UserProgram[]> {
  await initializeDatabase();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.map(parseProgram).filter((item): item is UserProgram => item !== null) : [];
  } catch {
    return [];
  }
}

export async function getUserProgram(programId: string): Promise<UserProgram | null> {
  return (await listUserPrograms()).find((program) => program.id === programId) ?? null;
}

export async function saveUserProgram(program: Omit<UserProgram, 'id' | 'updatedAt'> & { id?: string }): Promise<UserProgram> {
  const next: UserProgram = {
    id: program.id ?? Crypto.randomUUID(),
    name: program.name.trim(),
    sessions: program.sessions.map((session) => ({ ...session, name: session.name.trim() })),
    updatedAt: new Date().toISOString(),
  };
  if (validateUserProgram(next).length > 0) {
    throw new Error('A program needs a name, at least one named training day, and a valid exercise in every day.');
  }
  await initializeDatabase();
  const programs = await listUserPrograms();
  const index = programs.findIndex((item) => item.id === next.id);
  // Editing keeps the program in place in the list; new programs go to the end.
  const updated = index >= 0 ? programs.map((item) => (item.id === next.id ? next : item)) : [...programs, next];
  await writePrograms(updated);
  return next;
}

/** Saves a copy of a program under a new name, with fresh ids everywhere. */
export async function duplicateUserProgram(programId: string, name: string): Promise<UserProgram | null> {
  const source = await getUserProgram(programId);
  if (!source) return null;
  return saveUserProgram({
    name,
    sessions: source.sessions.map((session) => ({
      ...session,
      id: Crypto.randomUUID(),
      exercises: session.exercises.map((exercise) => ({ ...exercise, id: Crypto.randomUUID() })),
    })),
  });
}

export async function deleteUserProgram(programId: string): Promise<void> {
  await initializeDatabase();
  const programs = await listUserPrograms();
  const updated = programs.filter((item) => item.id !== programId);
  if (updated.length === 0) {
    await db.delete(settings).where(eq(settings.key, KEY));
    return;
  }
  await writePrograms(updated);
}

async function writePrograms(programs: UserProgram[]): Promise<void> {
  const value = JSON.stringify(programs);
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Reads one stored program; a damaged movement is dropped instead of hiding the whole program. */
function parseProgram(value: unknown): UserProgram | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<UserProgram>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.sessions)) return null;
  const sessions: UserProgramSession[] = [];
  for (const session of item.sessions as unknown[]) {
    if (!session || typeof session !== 'object') continue;
    const candidate = session as Partial<UserProgramSession>;
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || !Array.isArray(candidate.exercises)) continue;
    if (!Number.isInteger(candidate.weekday) || candidate.weekday! < 0 || candidate.weekday! > 6) continue;
    const exercises = candidate.exercises.filter((exercise) => exercise && typeof exercise === 'object' && isValidPrescription(exercise));
    if (exercises.length === 0) continue;
    sessions.push({ id: candidate.id, weekday: candidate.weekday!, name: candidate.name, exercises });
  }
  if (sessions.length === 0) return null;
  return {
    id: item.id,
    name: item.name,
    sessions,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
  };
}
