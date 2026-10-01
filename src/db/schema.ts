import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const exercises = sqliteTable(
  'exercise',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    aliases: text('aliases').notNull().default('[]'),
    metric: text('metric', {
      enum: ['reps', 'time', 'reps_load', 'time_load', 'distance'],
    }).notNull(),
    category: text('category').notNull(),
    /** JSON list of additional categories, e.g. planche is skill and also push. */
    extraCategories: text('extra_categories').notNull().default('[]'),
    movementPattern: text('movement_pattern'),
    movementTag: text('movement_tag'),
    /** JSON list of movement tags; movementTag keeps the first tag for legacy readers. */
    movementTags: text('movement_tags').notNull().default('[]'),
    movementGroup: text('movement_group'),
    primaryMuscles: text('primary_muscles').notNull().default('[]'),
    secondaryMuscles: text('secondary_muscles').notNull().default('[]'),
    equipment: text('equipment').notNull().default('[]'),
    unilateral: integer('unilateral', { mode: 'boolean' }).notNull().default(false),
    chainId: text('chain_id'),
    level: integer('level'),
    leverageFactor: real('leverage_factor'),
    cues: text('cues').notNull().default('[]'),
    demoUrl: text('demo_url'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    favourite: integer('favourite', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('exercise_category_idx').on(table.category)],
);

export const progressionChains = sqliteTable('progression_chain', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  family: text('family').notNull(),
});

export const levelCriteria = sqliteTable('level_criteria', {
  id: text('id').primaryKey(),
  chainId: text('chain_id')
    .notNull()
    .references(() => progressionChains.id),
  level: integer('level').notNull(),
  target: text('target').notNull(),
  requiredSessions: integer('required_sessions').notNull().default(1),
});

export const workouts = sqliteTable(
  'workout',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    sleep: integer('sleep'),
    energy: integer('energy'),
    soreness: integer('soreness'),
    sessionRpe: integer('session_rpe'),
    bodyweightKg: real('bodyweight_kg'),
  },
  (table) => [index('workout_started_at_idx').on(table.startedAt)],
);

export const exerciseEntries = sqliteTable(
  'exercise_entry',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    order: integer('order').notNull(),
    groupId: text('group_id'),
    groupType: text('group_type'),
    notes: text('notes'),
  },
  (table) => [index('entry_workout_order_idx').on(table.workoutId, table.order)],
);

export const trainingSets = sqliteTable(
  'training_set',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references(() => exerciseEntries.id, { onDelete: 'cascade' }),
    index: integer('set_index').notNull(),
    kind: text('kind').notNull().default('working'),
    reps: integer('reps'),
    durationSec: integer('duration_sec'),
    distanceM: real('distance_m'),
    addedLoadKg: real('added_load_kg').notNull().default(0),
    band: text('band'),
    rpe: real('rpe'),
    rir: real('rir'),
    side: text('side').notNull().default('both'),
    tempo: text('tempo'),
    restSec: integer('rest_sec'),
    note: text('note'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('set_entry_index_idx').on(table.entryId, table.index)],
);

export const bodyMeasurements = sqliteTable(
  'body_measurement',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    value: real('value').notNull(),
    unit: text('unit').notNull(),
    measuredAt: integer('measured_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('measurement_date_idx').on(table.measuredAt)],
);

export const progressPhotos = sqliteTable(
  'progress_photo',
  {
    id: text('id').primaryKey(),
    fileName: text('file_name').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    note: text('note').notNull().default(''),
    takenAt: integer('taken_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('progress_photo_taken_at_idx').on(table.takenAt)],
);

export const formCheckVideos = sqliteTable(
  'form_check_video',
  {
    id: text('id').primaryKey(),
    fileName: text('file_name').notNull().unique(),
    workoutId: text('workout_id').notNull().references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    setId: text('set_id').notNull().references(() => trainingSets.id, { onDelete: 'cascade' }),
    durationMs: integer('duration_ms').notNull(),
    fileSize: integer('file_size'),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('form_check_video_exercise_recorded_idx').on(table.exerciseId, table.recordedAt)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;

export const poseCaptures = sqliteTable(
  'pose_capture',
  {
    id: text('id').primaryKey(),
    positionId: text('position_id').notNull(),
    side: text('side'),
    value: real('value').notNull(),
    level: integer('level').notNull(),
    /** JSON array of 17 {x, y, score} keypoints in image pixels. */
    keypoints: text('keypoints').notNull(),
    fileName: text('file_name').notNull().unique(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    mediaKind: text('media_kind').notNull(),
    note: text('note').notNull().default(''),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('pose_capture_position_idx').on(table.positionId, table.capturedAt)],
);
