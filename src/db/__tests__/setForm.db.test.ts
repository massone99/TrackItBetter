import { migrateDatabase } from '../migrations';
import { seedCatalogIfEmpty } from '../seed/import';
import { createRealDatabase } from '../../test/realDatabase';

describe('schema v15: form rated per set', () => {
  it('moves the per-exercise ratings of 0.13.0 onto the completed working sets', async () => {
    const legacy = createRealDatabase();
    await migrateDatabase(legacy.expo);
    await seedCatalogIfEmpty(legacy.db as unknown as Parameters<typeof seedCatalogIfEmpty>[0]);
    legacy.sqlite.exec(`
      ALTER TABLE exercise DROP COLUMN apparatus_ids;
      ALTER TABLE exercise DROP COLUMN default_apparatus_id;
      ALTER TABLE exercise DROP COLUMN apparatus_affects_difficulty;
      ALTER TABLE exercise_entry DROP COLUMN apparatus_id;
      ALTER TABLE training_set DROP COLUMN bands;
      ALTER TABLE training_set DROP COLUMN assist_kg;
      ALTER TABLE training_set DROP COLUMN form_rating;
      DROP TABLE pose_capture;
      CREATE TABLE pose_capture (id TEXT PRIMARY KEY NOT NULL, position_id TEXT NOT NULL, side TEXT, value REAL NOT NULL, level INTEGER NOT NULL, keypoints TEXT NOT NULL, file_name TEXT NOT NULL UNIQUE, width INTEGER NOT NULL, height INTEGER NOT NULL, media_kind TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', captured_at INTEGER NOT NULL);
      PRAGMA user_version = 14;
      INSERT INTO workout (id, name, started_at, ended_at) VALUES ('w', 'Old', 10, 20);
      INSERT INTO exercise_entry (id, workout_id, exercise_id, "order", form_rating) VALUES ('e', 'w', 'push-up', 1, 4);
      INSERT INTO training_set (id, entry_id, set_index, kind, reps, added_load_kg, side, completed_at) VALUES
        ('done', 'e', 1, 'working', 8, 0, 'both', 20), ('warm', 'e', 2, 'warmup', 5, 0, 'both', 20), ('open', 'e', 3, 'working', 8, 0, 'both', NULL);
    `);
    await migrateDatabase(legacy.expo);
    const rows = legacy.sqlite.prepare('SELECT id, form_rating FROM training_set WHERE entry_id = ? ORDER BY set_index').all('e');
    expect(rows).toEqual([{ id: 'done', form_rating: 4 }, { id: 'warm', form_rating: null }, { id: 'open', form_rating: null }]);
  });
});
