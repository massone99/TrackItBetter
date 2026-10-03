import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabaseV5 } from './migrationsV5';

// Frozen v6/v7 migrations: historical fixtures must not depend on the latest app schema.
const movementClassificationSchema = `
ALTER TABLE exercise ADD COLUMN movement_tag TEXT;
ALTER TABLE exercise ADD COLUMN movement_group TEXT;
UPDATE exercise SET movement_group = CASE
  WHEN movement_pattern IN ('horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull', 'squat') THEN movement_pattern
  WHEN movement_pattern = 'single-leg-squat' THEN 'squat'
  WHEN id IN ('glute-bridge', 'single-leg-glute-bridge', 'glute-bridge-progression') THEN 'hinge'
  ELSE NULL
END;
PRAGMA user_version = 6;
`;

const extraCategoriesSchema = `
ALTER TABLE exercise ADD COLUMN extra_categories TEXT NOT NULL DEFAULT '[]';
UPDATE exercise SET extra_categories = '["push"]' WHERE category = 'skill' AND movement_pattern IN ('horizontal-push', 'vertical-push');
UPDATE exercise SET extra_categories = '["pull"]' WHERE category = 'skill' AND movement_pattern IN ('horizontal-pull', 'vertical-pull');
PRAGMA user_version = 7;
`;

/** Builds the actual schema before hold-group and multiple-tag migrations. */
export async function migrateDatabaseV7(database: SQLiteDatabase): Promise<void> {
  await migrateDatabaseV5(database);
  const { user_version: version } = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    ?? { user_version: 0 };

  if (version < 6) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(movementClassificationSchema);
    });
  }
  if (version < 7) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(extraCategoriesSchema);
    });
  }
}
