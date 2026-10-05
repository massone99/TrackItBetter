import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import { migrateDatabase } from './migrations';
import { seedCatalogIfEmpty } from './seed/import';

const DATABASE_NAME = 'trackitbetter.db';
const openSync = () => SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

/**
 * On web, synchronous calls busy-wait on a worker that first has to load SQLite's WASM, and the
 * first synchronous open can time out. There the handle opens lazily, after the worker has warmed up.
 */
let webHandle: SQLite.SQLiteDatabase | undefined;
// Kept module-private: dev tooling that inspects exports would otherwise trigger an early open.
const sqlite: SQLite.SQLiteDatabase = Platform.OS === 'web'
  ? new Proxy({} as SQLite.SQLiteDatabase, {
      get(_target, property) {
        webHandle ??= openSync();
        const value = Reflect.get(webHandle, property, webHandle);
        return typeof value === 'function' ? value.bind(webHandle) : value;
      },
    })
  : openSync();

async function warmUpWebWorker(): Promise<void> {
  if (Platform.OS !== 'web' || webHandle) return;
  // An in-memory database loads the worker and WASM without locking the real database file.
  const warmup = await SQLite.openDatabaseAsync(':memory:');
  await warmup.closeAsync();
}

export const db = drizzle(sqlite, { schema });
export type AppDatabase = typeof db;

let migrationPromise: Promise<void> | undefined;

export function initializeDatabase(): Promise<void> {
  migrationPromise ??= warmUpWebWorker()
    .then(() => migrateDatabase(sqlite))
    .then(() => seedCatalogIfEmpty(db))
    .catch((error: unknown) => {
      migrationPromise = undefined;
      throw error;
    });
  return migrationPromise;
}

