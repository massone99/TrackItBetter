import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as schema from '../db/schema';

/**
 * A real in-memory SQLite database for tests: the app's own migrations run on it and drizzle
 * queries execute real SQL, so constraint and column mistakes fail the way they do on a phone.
 */
export function createRealDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const run = (sql: string, params: unknown[], method: 'run' | 'all' | 'values' | 'get') => {
    const statement = sqlite.prepare(sql);
    const args = params as (string | number | null)[];
    if (method === 'run') {
      statement.run(...args);
      return { rows: [] };
    }
    const rows = statement.all(...args).map((row) => Object.values(row));
    return { rows: method === 'get' ? rows[0] : rows };
  };
  const db = drizzle(async (sql, params, method) => run(sql, params, method), { schema });

  // The subset of expo-sqlite that migrateDatabase uses.
  const expo = {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    getFirstAsync: async <T>(sql: string) => sqlite.prepare(sql).get() as T,
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;

  return { sqlite, db, expo };
}
