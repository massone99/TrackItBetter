import { sql } from 'drizzle-orm';
import { db, initializeDatabase } from './client';

/**
 * Rows changed through the app's connection since it opened. Every write (workouts, sets, edits,
 * restores) moves it, so a cache keyed on it never serves stale data.
 */
export async function dataVersion(): Promise<number> {
  await initializeDatabase();
  const [row] = await db.all<Record<string, number> | number[]>(sql`SELECT total_changes() AS n`);
  return Number(row ? Object.values(row)[0] : -1);
}

/**
 * Wraps a read so repeated calls share one result until the database changes. Screens that call
 * several analytics functions then scan the history once instead of once per function.
 */
export function cachedUntilWrite<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: { version: number; value: Promise<T> } | null = null;
  return async () => {
    const version = await dataVersion();
    if (cached?.version !== version) {
      const value = load();
      cached = { version, value };
      value.catch(() => { if (cached?.value === value) cached = null; });
    }
    return cached.value;
  };
}
