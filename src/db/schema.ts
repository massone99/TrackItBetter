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
    /** Mobility work done by your own strength (active) or moved into position by gravity, load or a partner (passive); null when unspecified. */
    mobilityMode: text('mobility_mode', { enum: ['active', 'passive'] }),
    primaryMuscles: text('primary_muscles').notNull().default('[]'),
    secondaryMuscles: text('secondary_muscles').notNull().default('[]'),
    equipment: text('equipment').notNull().default('[]'),
    unilateral: integer('unilateral', { mode: 'boolean' }).notNull().default(false),
    unilateralRestMode: text('unilateral_rest_mode', { enum: ['side', 'pair'] }).notNull().default('pair'),
    chainId: text('chain_id'),
    level: integer('level'),
    leverageFactor: real('leverage_factor'),
    cues: text('cues').notNull().default('[]'),
    demoUrl: text('demo_url'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    favourite: integer('favourite', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    /** JSON list of apparatus ids (see features/equipment) this exercise can be done on; empty for none. */
    apparatusIds: text('apparatus_ids').notNull().default('[]'),
    defaultApparatusId: text('default_apparatus_id'),
    /** When true, comparisons and records only use sessions on the same apparatus. */
    apparatusAffectsDifficulty: integer('apparatus_affects_difficulty', { mode: 'boolean' }).notNull().default(false),
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
    unilateralRestMode: text('unilateral_rest_mode', { enum: ['side', 'pair'] }),
    /** Part of the workout (warm-up, main work, mobility); null is the main work. */
    block: text('block', { enum: ['warmup', 'main', 'mobility'] }),
    notes: text('notes'),
    /** Apparatus used for this exercise in this workout; null means the exercise's default. */
    apparatusId: text('apparatus_id'),
    /** Per-exercise form rating from 0.13.0; ratings now live on the sets (see trainingSets.formRating). */
    formRating: integer('form_rating'),
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
    pairId: text('pair_id'),
    tempo: text('tempo'),
    restSec: integer('rest_sec'),
    /** RPE the program planned for this set; null without a target. */
    targetRpe: real('target_rpe'),
    /** How clean the form of this set was, 1–5; null when not rated. */
    formRating: integer('form_rating'),
    note: text('note'),
    /** JSON list of { bandId, tension } for resistance bands that helped this set; null when none. */
    bands: text('bands'),
    /** Assistance of those bands in kg when the set was logged; null without bands or when a band's kg are unknown. */
    assistKg: real('assist_kg'),
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
    /** The exercise (and logged set) the analysis belongs to, if any. */
    exerciseId: text('exercise_id').references(() => exercises.id, { onDelete: 'set null' }),
    setId: text('set_id').references(() => trainingSets.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('pose_capture_position_idx').on(table.positionId, table.capturedAt),
    index('pose_capture_exercise_idx').on(table.exerciseId),
    index('pose_capture_set_idx').on(table.setId),
  ],
);
