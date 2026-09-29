import { and, asc, eq, like, or } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { exercises } from '../../db/schema';

export interface ExerciseFilters {
  query?: string;
  category?: string;
  favouritesOnly?: boolean;
}

/** Search the local catalog. JSON-backed fields are decoded by the feature layer. */
export async function listExercises(filters: ExerciseFilters = {}) {
  await initializeDatabase();
  const conditions = [eq(exercises.archived, false)];
  const query = filters.query?.trim();

  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(or(like(exercises.name, pattern), like(exercises.aliases, pattern))!);
  }
  if (filters.category) {
    conditions.push(or(eq(exercises.category, filters.category), like(exercises.extraCategories, `%"${filters.category}"%`))!);
  }
  if (filters.favouritesOnly) conditions.push(eq(exercises.favourite, true));

  return db
    .select()
    .from(exercises)
    .where(and(...conditions))
    .orderBy(asc(exercises.name));
}

export async function setExerciseFavourite(id: string, favourite: boolean): Promise<void> {
  await initializeDatabase();
  await db.update(exercises).set({ favourite }).where(eq(exercises.id, id));
}

/** Attaches (or clears, with null) a link to a reference video showing good form. */
export async function setExerciseDemoUrl(id: string, demoUrl: string | null): Promise<void> {
  await initializeDatabase();
  await db.update(exercises).set({ demoUrl }).where(eq(exercises.id, id));
}

/** Hides a custom exercise from the library; logged workouts that used it stay intact. */
export async function archiveCustomExercise(id: string): Promise<void> {
  await initializeDatabase();
  await db.update(exercises).set({ archived: true }).where(and(eq(exercises.id, id), eq(exercises.isCustom, true)));
}

export async function getExerciseById(id: string) {
  await initializeDatabase();
  const [exercise] = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
  return exercise ?? null;
}
