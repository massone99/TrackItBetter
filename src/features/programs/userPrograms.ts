import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { settings } from '../../db/schema';
import { GROUP_KINDS, PROGRAM_LAYOUTS, PROGRAM_STATUSES, type ProgramGroup } from '../../domain/programStructure';
import { AUTHOR_MAX, CATEGORY_MAX, isValidPrescription, normalizeAuthor, normalizeCategory, normalizeClusterName, normalizeClusters, normalizeField, PROGRAM_DISCIPLINES, validateUserProgram, WEEK_ORDER, type UserProgram, type UserProgramSession } from '../../domain/userProgram';

export type { UserProgram, UserProgramExercise, UserProgramSession } from '../../domain/userProgram';

const KEY = 'user_weekly_programs_v1';
const CLUSTERS_KEY = 'program_clusters_v1';

export async function listUserPrograms(): Promise<UserProgram[]> {
  await initializeDatabase();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsePrograms(parsed) : [];
  } catch {
    return [];
  }
}

export async function getUserProgram(programId: string): Promise<UserProgram | null> {
  return (await listUserPrograms()).find((program) => program.id === programId) ?? null;
}

export async function saveUserProgram(program: Omit<UserProgram, 'id' | 'updatedAt'> & { id?: string }): Promise<UserProgram> {
  const clusters = normalizeClusters(program.clusters);
  const next: UserProgram = {
    id: program.id ?? Crypto.randomUUID(),
    name: program.name.trim(),
    sessions: program.sessions.map((session) => ({ ...session, name: session.name.trim(), notes: session.notes?.trim().slice(0, 1000) || null })),
    updatedAt: new Date().toISOString(),
    category: normalizeCategory(program.category),
    author: normalizeAuthor(program.author),
    discipline: PROGRAM_DISCIPLINES.includes(program.discipline as never) ? program.discipline : undefined,
    clusters: clusters.length > 0 ? clusters : undefined,
    status: program.status,
    layout: program.layout,
    groups: program.groups,
    lastUsedAt: program.lastUsedAt,
  };
  if (validateUserProgram(next).length > 0) {
    throw new Error('A program needs a name, and every workout in it a name and at least one valid exercise.');
  }
  await initializeDatabase();
  const programs = await listUserPrograms();
  const index = programs.findIndex((item) => item.id === next.id);
  // Editing keeps the program in place in the list; new programs go to the end.
  const updated = index >= 0 ? programs.map((item) => (item.id === next.id ? next : item)) : [...programs, next];
  await writePrograms(updated);
  if (clusters.length > 0) {
    const existingClusters = await listProgramClusters();
    const merged = normalizeClusters([...existingClusters, ...clusters]);
    if (merged.length !== existingClusters.length) await writeClusters(merged);
  }
  return next;
}

/** Saves a copy of a program under a new name, with fresh ids everywhere. */
export async function duplicateUserProgram(programId: string, name: string): Promise<UserProgram | null> {
  const source = await getUserProgram(programId);
  if (!source) return null;
  const groupIds = new Map((source.groups ?? []).map((group) => [group.id, Crypto.randomUUID()]));
  return saveUserProgram({
    name,
    category: source.category ?? null,
    author: source.author ?? null,
    layout: source.layout,
    status: 'active',
    groups: source.groups?.map((group) => ({ ...group, id: groupIds.get(group.id)!, parentId: group.parentId ? groupIds.get(group.parentId) ?? null : null })),
    sessions: source.sessions.map((session) => ({
      ...session,
      id: Crypto.randomUUID(),
      groupId: session.groupId ? groupIds.get(session.groupId) ?? null : null,
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

/** Reads stored programs, dropping damaged ones. */
export function parsePrograms(values: readonly unknown[]): UserProgram[] {
  return values.map(parseProgram).filter((item): item is UserProgram => item !== null);
}

/**
 * Reads one stored program; a damaged movement is dropped instead of hiding the whole program.
 * Programs saved before sessions lost their weekday keep the old Monday-first order as rotation order.
 */
function parseProgram(value: unknown): UserProgram | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<UserProgram>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.sessions)) return null;
  const sessions: (UserProgramSession & { order: number })[] = [];
  for (const [position, session] of (item.sessions as unknown[]).entries()) {
    if (!session || typeof session !== 'object') continue;
    const candidate = session as Partial<UserProgramSession> & { weekday?: unknown };
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || !Array.isArray(candidate.exercises)) continue;
    const exercises = candidate.exercises.filter((exercise) => exercise && typeof exercise === 'object' && isValidPrescription(exercise));
    if (exercises.length === 0) continue;
    const day = WEEK_ORDER.indexOf(candidate.weekday as never);
    sessions.push({ id: candidate.id, name: candidate.name, notes: typeof candidate.notes === 'string' ? candidate.notes : null, exercises, groupId: typeof candidate.groupId === 'string' ? candidate.groupId : null, order: (day >= 0 ? day : 7) * 1000 + position });
  }
  return {
    id: item.id,
    name: item.name,
    sessions: sessions.sort((a, b) => a.order - b.order).map(({ order: _order, ...session }) => session),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
    category: typeof item.category === 'string' ? normalizeCategory(item.category) : null,
    author: typeof item.author === 'string' ? normalizeAuthor(item.author) : null,
    discipline: PROGRAM_DISCIPLINES.includes(item.discipline as never) ? item.discipline : undefined,
    clusters: Array.isArray(item.clusters) ? (() => {
      const normalized = normalizeClusters(item.clusters.filter((entry): entry is string => typeof entry === 'string'));
      return normalized.length > 0 ? normalized : undefined;
    })() : undefined,
    status: PROGRAM_STATUSES.includes(item.status as never) ? item.status : undefined,
    layout: PROGRAM_LAYOUTS.includes(item.layout as never) ? item.layout : undefined,
    groups: Array.isArray(item.groups) ? parseGroups(item.groups as unknown[]) : undefined,
    lastUsedAt: typeof item.lastUsedAt === 'string' ? item.lastUsedAt : null,
  };
}

/** Adds a workout to a program; returns the updated program, or null when it no longer exists. */
export async function addSessionToProgram(programId: string, session: UserProgramSession): Promise<UserProgram | null> {
  const program = await getUserProgram(programId);
  if (!program) return null;
  return saveUserProgram({ ...program, sessions: [...program.sessions, session] });
}

function parseGroups(values: unknown[]): ProgramGroup[] {
  return values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const group = value as Partial<ProgramGroup>;
    if (typeof group.id !== 'string' || typeof group.name !== 'string' || !GROUP_KINDS.includes(group.kind as never)) return [];
    return [{ id: group.id, name: group.name, kind: group.kind!, parentId: typeof group.parentId === 'string' ? group.parentId : null }];
  });
}

/** Partial update that keeps everything else (status, layout, groups, lastUsedAt). */
export async function updateUserProgram(programId: string, change: (program: UserProgram) => Partial<UserProgram>): Promise<UserProgram | null> {
  const program = await getUserProgram(programId);
  if (!program) return null;
  return saveUserProgram({ ...program, ...change(program), id: program.id });
}

async function renameProgramField(field: 'category' | 'author', from: string, to: string | null): Promise<void> {
  await initializeDatabase();
  const programs = await listUserPrograms();
  const max = field === 'category' ? CATEGORY_MAX : AUTHOR_MAX;
  const nextValue = normalizeField(to, max);
  if (nextValue === from) return;
  const now = new Date().toISOString();
  let changed = false;
  const updated = programs.map((program) => {
    if (program[field] !== from) return program;
    changed = true;
    return { ...program, [field]: nextValue, updatedAt: now };
  });
  if (changed) await writePrograms(updated);
}

/** Renames or clears a category across every program that uses it. */
export const renameProgramCategory = (from: string, to: string | null): Promise<void> =>
  renameProgramField('category', from, to);

/** Renames or clears an author across every program that uses it. */
export const renameProgramAuthor = (from: string, to: string | null): Promise<void> =>
  renameProgramField('author', from, to);

async function writeClusters(clusters: readonly string[]): Promise<void> {
  await db
    .insert(settings)
    .values({ key: CLUSTERS_KEY, value: JSON.stringify(normalizeClusters(clusters)) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(normalizeClusters(clusters)) } });
}

/** Lists user-created custom clusters (sorted alphabetically). */
export async function listProgramClusters(): Promise<string[]> {
  await initializeDatabase();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, CLUSTERS_KEY)).limit(1);
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return normalizeClusters(parsed.filter((item): item is string => typeof item === 'string')).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Creates a custom cluster if it does not already exist; returns updated cluster list. */
export async function createProgramCluster(name: string): Promise<string[]> {
  const clean = normalizeClusterName(name);
  const existing = await listProgramClusters();
  if (!clean) return existing;
  const updated = normalizeClusters([...existing, clean]).sort((a, b) => a.localeCompare(b));
  await writeClusters(updated);
  return updated;
}

/** Renames a custom cluster in both the cluster list and every program that belongs to it. */
export async function renameProgramCluster(from: string, to: string): Promise<void> {
  const nextName = normalizeClusterName(to);
  if (!nextName || nextName === from) return;
  await initializeDatabase();
  const [clusters, programs] = await Promise.all([listProgramClusters(), listUserPrograms()]);
  const nextClusters = normalizeClusters([...clusters.filter((item) => item !== from), nextName]).sort((a, b) => a.localeCompare(b));
  await writeClusters(nextClusters);
  const now = new Date().toISOString();
  let changed = false;
  const updatedPrograms = programs.map((program) => {
    if (!program.clusters?.includes(from)) return program;
    changed = true;
    const next = normalizeClusters(program.clusters.map((item) => (item === from ? nextName : item)));
    return { ...program, clusters: next.length > 0 ? next : undefined, updatedAt: now };
  });
  if (changed) await writePrograms(updatedPrograms);
}

/** Deletes a custom cluster and removes it from every program that belongs to it. */
export async function deleteProgramCluster(name: string): Promise<void> {
  await initializeDatabase();
  const [clusters, programs] = await Promise.all([listProgramClusters(), listUserPrograms()]);
  await writeClusters(clusters.filter((item) => item !== name));
  const now = new Date().toISOString();
  let changed = false;
  const updatedPrograms = programs.map((program) => {
    if (!program.clusters?.includes(name)) return program;
    changed = true;
    const next = program.clusters.filter((item) => item !== name);
    return { ...program, clusters: next.length > 0 ? next : undefined, updatedAt: now };
  });
  if (changed) await writePrograms(updatedPrograms);
}
