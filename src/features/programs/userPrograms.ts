import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { settings } from '../../db/schema';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface UserProgramExercise {
  id: string;
  exerciseId: string;
  sets: number;
  target: number;
  restSeconds: number;
}

export interface UserProgramSession {
  id: string;
  weekday: Weekday;
  name: string;
  exercises: UserProgramExercise[];
}

export interface UserProgram {
  id: string;
  name: string;
  sessions: UserProgramSession[];
  updatedAt: string;
}

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

export async function saveUserProgram(program: Omit<UserProgram, 'id' | 'updatedAt'> & { id?: string }): Promise<UserProgram> {
  const next: UserProgram = {
    id: program.id ?? Crypto.randomUUID(),
    name: program.name.trim(),
    sessions: program.sessions,
    updatedAt: new Date().toISOString(),
  };
  if (!next.name || next.sessions.length === 0 || next.sessions.some((session) => session.exercises.length === 0)) {
    throw new Error('A program needs a name, at least one training day, and an exercise in every day.');
  }
  await initializeDatabase();
  const programs = await listUserPrograms();
  const updated = [...programs.filter((item) => item.id !== next.id), next];
  await db.insert(settings).values({ key: KEY, value: JSON.stringify(updated) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(updated) } });
  return next;
}

export async function deleteUserProgram(programId: string): Promise<void> {
  await initializeDatabase();
  const programs = await listUserPrograms();
  const updated = programs.filter((item) => item.id !== programId);
  if (updated.length === 0) {
    await db.delete(settings).where(eq(settings.key, KEY));
    return;
  }
  await db.update(settings).set({ value: JSON.stringify(updated) }).where(eq(settings.key, KEY));
}

function parseProgram(value: unknown): UserProgram | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<UserProgram>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.sessions)) return null;
  const sessions = item.sessions.filter((session): session is UserProgramSession => {
    if (!session || typeof session !== 'object') return false;
    const candidate = session as Partial<UserProgramSession>;
    return typeof candidate.id === 'string' && Number.isInteger(candidate.weekday) && candidate.weekday! >= 0 && candidate.weekday! <= 6
      && typeof candidate.name === 'string' && Array.isArray(candidate.exercises)
      && candidate.exercises.every((exercise) => exercise && typeof exercise.id === 'string' && typeof exercise.exerciseId === 'string'
        && Number.isInteger(exercise.sets) && exercise.sets > 0 && Number.isFinite(exercise.target) && exercise.target > 0
        && Number.isInteger(exercise.restSeconds) && exercise.restSeconds >= 0);
  });
  return sessions.length === item.sessions.length ? {
    id: item.id,
    name: item.name,
    sessions,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
  } : null;
}
