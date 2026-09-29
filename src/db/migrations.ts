import type { SQLiteDatabase } from 'expo-sqlite';

const initialSchema = `
CREATE TABLE IF NOT EXISTS exercise (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  metric TEXT NOT NULL CHECK (metric IN ('reps', 'time', 'reps_load', 'time_load', 'distance')),
  category TEXT NOT NULL,
  movement_pattern TEXT,
  primary_muscles TEXT NOT NULL DEFAULT '[]',
  secondary_muscles TEXT NOT NULL DEFAULT '[]',
  equipment TEXT NOT NULL DEFAULT '[]',
  unilateral INTEGER NOT NULL DEFAULT 0,
  chain_id TEXT,
  level INTEGER,
  leverage_factor REAL,
  cues TEXT NOT NULL DEFAULT '[]',
  demo_url TEXT,
  is_custom INTEGER NOT NULL DEFAULT 0,
  favourite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS exercise_category_idx ON exercise(category);
CREATE TABLE IF NOT EXISTS progression_chain (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  family TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS level_criteria (
  id TEXT PRIMARY KEY NOT NULL,
  chain_id TEXT NOT NULL REFERENCES progression_chain(id),
  level INTEGER NOT NULL,
  target TEXT NOT NULL,
  required_sessions INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS workout (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  notes TEXT,
  sleep INTEGER,
  energy INTEGER,
  soreness INTEGER,
  session_rpe INTEGER,
  bodyweight_kg REAL
);
CREATE INDEX IF NOT EXISTS workout_started_at_idx ON workout(started_at);
CREATE TABLE IF NOT EXISTS exercise_entry (
  id TEXT PRIMARY KEY NOT NULL,
  workout_id TEXT NOT NULL REFERENCES workout(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  "order" INTEGER NOT NULL,
  group_id TEXT,
  group_type TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS entry_workout_order_idx ON exercise_entry(workout_id, "order");
CREATE TABLE IF NOT EXISTS training_set (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES exercise_entry(id) ON DELETE CASCADE,
  set_index INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'working',
  reps INTEGER,
  duration_sec INTEGER,
  distance_m REAL,
  added_load_kg REAL NOT NULL DEFAULT 0,
  band TEXT,
  rpe REAL,
  rir REAL,
  side TEXT NOT NULL DEFAULT 'both',
  tempo TEXT,
  rest_sec INTEGER,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS set_entry_index_idx ON training_set(entry_id, set_index);
CREATE TABLE IF NOT EXISTS body_measurement (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  measured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS measurement_date_idx ON body_measurement(measured_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
PRAGMA user_version = 1;
`;

const progressPhotosSchema = `
CREATE TABLE IF NOT EXISTS progress_photo (
  id TEXT PRIMARY KEY NOT NULL,
  file_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  taken_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS progress_photo_taken_at_idx ON progress_photo(taken_at);
PRAGMA user_version = 2;
`;

const formCheckVideosSchema = `
CREATE TABLE IF NOT EXISTS form_check_video (
  id TEXT PRIMARY KEY NOT NULL,
  file_name TEXT NOT NULL UNIQUE,
  workout_id TEXT NOT NULL REFERENCES workout(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  set_id TEXT NOT NULL REFERENCES training_set(id) ON DELETE CASCADE,
  duration_ms INTEGER NOT NULL,
  file_size INTEGER,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS form_check_video_exercise_recorded_idx ON form_check_video(exercise_id, recorded_at);
PRAGMA user_version = 3;
`;

const setNotesSchema = `
ALTER TABLE training_set ADD COLUMN note TEXT;
PRAGMA user_version = 4;
`;

// Skill holds that are also a push or a pull start with that extra category.
const extraCategoriesSchema = `
ALTER TABLE exercise ADD COLUMN extra_categories TEXT NOT NULL DEFAULT '[]';
UPDATE exercise SET extra_categories = '["push"]' WHERE category = 'skill' AND movement_pattern IN ('horizontal-push', 'vertical-push');
UPDATE exercise SET extra_categories = '["pull"]' WHERE category = 'skill' AND movement_pattern IN ('horizontal-pull', 'vertical-pull');
PRAGMA user_version = 6;
`;

const poseCapturesSchema = `
CREATE TABLE IF NOT EXISTS pose_capture (
  id TEXT PRIMARY KEY NOT NULL,
  position_id TEXT NOT NULL,
  side TEXT,
  value REAL NOT NULL,
  level INTEGER NOT NULL,
  keypoints TEXT NOT NULL,
  file_name TEXT NOT NULL UNIQUE,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  media_kind TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  captured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pose_capture_position_idx ON pose_capture(position_id, captured_at);
PRAGMA user_version = 5;
`;

/** Applies numbered, local-first SQLite schema migrations once per database. */
export async function migrateDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  const { user_version: version } = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  ) ?? { user_version: 0 };

  if (version < 1) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(initialSchema);
    });
  }

  if (version < 2) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(progressPhotosSchema);
    });
  }

  if (version < 3) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(formCheckVideosSchema);
    });
  }

  if (version < 4) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(setNotesSchema);
    });
  }

  if (version < 5) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(poseCapturesSchema);
    });
  }

  if (version < 6) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(extraCategoriesSchema);
    });
  }
}
