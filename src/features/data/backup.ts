import { z } from 'zod';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { db, initializeDatabase } from '../../db/client';
import {
  bodyMeasurements,
  exerciseEntries,
  exercises,
  levelCriteria,
  progressionChains,
  poseCaptures,
  progressPhotos,
  formCheckVideos,
  settings,
  trainingSets,
  workouts,
} from '../../db/schema';
import { getProgressPhotoFile, preparePhotoDirectory } from '../photos/repository';
import { getPoseCaptureFile, preparePoseCaptureDirectory } from '../pose/repository';
import { getFormCheckVideoFile } from '../media/formVideos';
import { MOVEMENT_GROUP_IDS, MOVEMENT_TAGS, canonicalizeMovementTag, normalizeExerciseClassification } from '../exercises/movementCatalog';

const timestamp = z.string().datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const nullableNumber = z.number().finite().nullable();
const nullableString = z.string().nullable();

const exerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  aliases: z.string(),
  metric: z.enum(['reps', 'time', 'reps_load', 'time_load', 'distance']),
  category: z.string(),
  // Added in schema v6; older backups omit it.
  extraCategories: z.string().optional(),
  movementPattern: nullableString,
  // Added in schema v6; old backups omit both user-editable classifications.
  movementTag: nullableString.optional().refine((tag) => tag == null || (MOVEMENT_TAGS as readonly string[]).includes(canonicalizeMovementTag(tag) ?? '')),
  // Added in schema v9. Missing lists are restored from the legacy single tag.
  movementTags: z.string().optional().refine((value) => {
    if (value === undefined) return true;
    try {
      const tags: unknown = JSON.parse(value);
      return Array.isArray(tags) && tags.every((tag) => typeof tag === 'string'
        && (MOVEMENT_TAGS as readonly string[]).includes(canonicalizeMovementTag(tag) ?? ''));
    } catch {
      return false;
    }
  }),
  movementGroup: z.enum(MOVEMENT_GROUP_IDS).nullable().optional(),
  // Added in schema v11; older backups leave it unspecified.
  mobilityMode: z.enum(['active', 'passive']).nullable().optional(),
  primaryMuscles: z.string(),
  secondaryMuscles: z.string(),
  equipment: z.string(),
  unilateral: z.boolean(),
  // Added in schema v10; old backups use the default pair-level recovery.
  unilateralRestMode: z.enum(['side', 'pair']).default('pair'),
  chainId: nullableString,
  level: z.number().int().nullable(),
  leverageFactor: nullableNumber,
  cues: z.string(),
  demoUrl: nullableString,
  isCustom: z.boolean(),
  favourite: z.boolean(),
  archived: z.boolean(),
  createdAt: timestamp,
}).strict();

const progressionChainSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  family: z.string(),
}).strict();

const levelCriteriaSchema = z.object({
  id: z.string().min(1),
  chainId: z.string().min(1),
  level: z.number().int(),
  target: z.string(),
  requiredSessions: z.number().int(),
}).strict();

const workoutSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  startedAt: timestamp,
  endedAt: nullableTimestamp,
  notes: nullableString,
  sleep: z.number().int().nullable(),
  energy: z.number().int().nullable(),
  soreness: z.number().int().nullable(),
  sessionRpe: z.number().int().nullable(),
  bodyweightKg: nullableNumber,
}).strict();

const entrySchema = z.object({
  id: z.string().min(1),
  workoutId: z.string().min(1),
  exerciseId: z.string().min(1),
  order: z.number().int(),
  groupId: nullableString,
  groupType: nullableString,
  notes: nullableString,
  // Added in schema v10; null means the exercise preference applies.
  unilateralRestMode: z.enum(['side', 'pair']).nullable().default(null),
  // Added in schema v12; null is the main work.
  block: z.enum(['warmup', 'main', 'mobility']).nullable().default(null),
  // Added in schema v14.
  formRating: z.number().int().min(1).max(5).nullable().default(null),
}).strict();

const setSchema = z.object({
  id: z.string().min(1),
  entryId: z.string().min(1),
  index: z.number().int(),
  kind: z.string(),
  reps: z.number().int().nullable(),
  durationSec: z.number().int().nullable(),
  distanceM: nullableNumber,
  addedLoadKg: z.number().finite(),
  band: nullableString,
  rpe: nullableNumber,
  rir: nullableNumber,
  side: z.string(),
  tempo: nullableString,
  restSec: z.number().int().nullable(),
  // Added in schema v4; older backups omit it.
  note: nullableString.optional(),
  completedAt: nullableTimestamp,
  // Added in schema v10; null keeps legacy, unpaired-set semantics.
  pairId: z.string().min(1).nullable().default(null),
  // Added in schema v14.
  targetRpe: nullableNumber.default(null),
}).strict();

const measurementSchema = z.object({
  id: z.string().min(1),
  kind: z.string(),
  value: z.number().finite(),
  unit: z.string(),
  measuredAt: timestamp,
}).strict();

const settingSchema = z.object({ key: z.string().min(1), value: z.string() }).strict();

const backupDataObject = z.object({
    exercises: z.array(exerciseSchema),
    progressionChains: z.array(progressionChainSchema),
    levelCriteria: z.array(levelCriteriaSchema),
    workouts: z.array(workoutSchema),
    exerciseEntries: z.array(entrySchema),
    trainingSets: z.array(setSchema),
    bodyMeasurements: z.array(measurementSchema),
    settings: z.array(settingSchema),
  }).strict();

function validateBackupData(data: z.infer<typeof backupDataObject>, ctx: z.RefinementCtx): void {
  const checkUnique = (rows: { id: string }[], table: string) => {
    const seen = new Set<string>();
    rows.forEach(({ id }, index) => {
      if (seen.has(id)) ctx.addIssue({ code: 'custom', path: ['data', table, index, 'id'], message: 'Duplicate id' });
      seen.add(id);
    });
  };
  checkUnique(data.exercises, 'exercises');
  checkUnique(data.progressionChains, 'progressionChains');
  checkUnique(data.levelCriteria, 'levelCriteria');
  checkUnique(data.workouts, 'workouts');
  checkUnique(data.exerciseEntries, 'exerciseEntries');
  checkUnique(data.trainingSets, 'trainingSets');
  checkUnique(data.bodyMeasurements, 'bodyMeasurements');
  const checkUniqueSettings = new Set<string>();
  data.settings.forEach(({ key }, index) => {
    if (checkUniqueSettings.has(key)) ctx.addIssue({ code: 'custom', path: ['data', 'settings', index, 'key'], message: 'Duplicate key' });
    checkUniqueSettings.add(key);
  });

  const exercisesById = new Set(data.exercises.map(({ id }) => id));
  const workoutsById = new Set(data.workouts.map(({ id }) => id));
  const entriesById = new Set(data.exerciseEntries.map(({ id }) => id));
  const chainsById = new Set(data.progressionChains.map(({ id }) => id));
  data.exercises.forEach((exercise, index) => {
    if (exercise.chainId && !chainsById.has(exercise.chainId)) {
      ctx.addIssue({ code: 'custom', path: ['data', 'exercises', index, 'chainId'], message: 'Progression chain does not exist in backup' });
    }
  });
  data.exerciseEntries.forEach((entry, index) => {
    if (!workoutsById.has(entry.workoutId)) ctx.addIssue({ code: 'custom', path: ['data', 'exerciseEntries', index, 'workoutId'], message: 'Workout does not exist in backup' });
    if (!exercisesById.has(entry.exerciseId)) ctx.addIssue({ code: 'custom', path: ['data', 'exerciseEntries', index, 'exerciseId'], message: 'Exercise does not exist in backup' });
  });
  data.trainingSets.forEach((set, index) => {
    if (!entriesById.has(set.entryId)) ctx.addIssue({ code: 'custom', path: ['data', 'trainingSets', index, 'entryId'], message: 'Entry does not exist in backup' });
  });

  // A pair is deliberately validated as a unit. Legacy sets have no pairId and
  // retain their historical meaning, while a v3 pair must contain one L and one R
  // set for the same exercise entry and set kind.
  const entryById = new Map(data.exerciseEntries.map((entry) => [entry.id, entry]));
  const workoutById = new Map(data.workouts.map((workout) => [workout.id, workout]));
  const pairs = new Map<string, { set: (typeof data.trainingSets)[number]; index: number }[]>();
  data.trainingSets.forEach((set, index) => {
    if (set.pairId === null) return;
    const pair = pairs.get(set.pairId) ?? [];
    pair.push({ set, index });
    pairs.set(set.pairId, pair);
  });
  pairs.forEach((members, pairId) => {
    const path = ['data', 'trainingSets', members[0]?.index ?? 0, 'pairId'];
    if (members.length !== 2) {
      ctx.addIssue({ code: 'custom', path, message: `Pair ${pairId} must contain exactly one left and one right set` });
      return;
    }
    const sides = members.map(({ set }) => set.side);
    if (new Set(sides).size !== 2 || !sides.includes('left') || !sides.includes('right')) {
      ctx.addIssue({ code: 'custom', path, message: `Pair ${pairId} must contain one left and one right set` });
    }
    const [first, second] = members.map(({ set }) => set);
    if (first.entryId !== second.entryId) {
      ctx.addIssue({ code: 'custom', path, message: `Pair ${pairId} must use one exercise entry` });
    }
    if (first.kind !== second.kind) {
      ctx.addIssue({ code: 'custom', path, message: `Pair ${pairId} must use one set kind` });
    }
    const entry = entryById.get(first.entryId);
    const workout = entry ? workoutById.get(entry.workoutId) : undefined;
    if (workout?.endedAt !== null && workout?.endedAt !== undefined) {
      const completed = members.map(({ set }) => set.completedAt !== null);
      if (completed[0] !== completed[1]) {
        ctx.addIssue({ code: 'custom', path, message: `Pair ${pairId} is partially completed in an ended workout` });
      }
    }
  });
  data.levelCriteria.forEach((criteria, index) => {
    if (!chainsById.has(criteria.chainId)) ctx.addIssue({ code: 'custom', path: ['data', 'levelCriteria', index, 'chainId'], message: 'Progression chain does not exist in backup' });
  });
}

const photoMetadataSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string().regex(/^[a-f0-9-]{36}\.(jpg|png|webp|heic|heif)$/i),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  note: z.string().max(2000),
  takenAt: timestamp,
}).strict();

const photoAssetSchema = photoMetadataSchema.extend({
  base64: z.string().min(4).max(20_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();

const base64Schema = z.string().min(4).max(20_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

const poseCaptureAssetSchema = z.object({
  id: z.string().uuid(),
  positionId: z.string().min(1).max(40),
  side: z.enum(['left', 'right']).nullable(),
  value: z.number().finite(),
  level: z.number().int().min(1).max(5),
  keypoints: z.string().max(20_000),
  fileName: z.string().regex(/^[a-f0-9-]{36}\.jpg$/i),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mediaKind: z.enum(['photo', 'frame']),
  note: z.string().max(2000),
  capturedAt: timestamp,
  base64: base64Schema,
}).strict();

const backupV1Schema = z.object({
  format: z.literal('trackitbetter-backup'),
  version: z.literal(1),
  exportedAt: timestamp,
  data: backupDataObject.superRefine(validateBackupData),
}).strict();

const backupV2Schema = z.object({
  format: z.literal('trackitbetter-backup'),
  version: z.literal(2),
  exportedAt: timestamp,
  data: backupDataObject.extend({
    progressPhotos: z.array(photoAssetSchema).max(500),
    // Added with pose check; backups made before it simply omit the field.
    poseCaptures: z.array(poseCaptureAssetSchema).max(500).optional(),
  }).strict().superRefine((data, ctx) => {
    validateBackupData(data, ctx);
  }),
}).strict().superRefine(({ data }, ctx) => {
  const seen = new Set<string>();
  data.progressPhotos.forEach((photo, index) => {
    if (seen.has(photo.id)) ctx.addIssue({ code: 'custom', path: ['data', 'progressPhotos', index, 'id'], message: 'Duplicate id' });
    seen.add(photo.id);
    const expectedMime = photo.fileName.endsWith('.png') ? 'image/png' : photo.fileName.endsWith('.webp') ? 'image/webp' : photo.fileName.endsWith('.heic') ? 'image/heic' : photo.fileName.endsWith('.heif') ? 'image/heif' : 'image/jpeg';
    if (photo.mimeType !== expectedMime) ctx.addIssue({ code: 'custom', path: ['data', 'progressPhotos', index, 'mimeType'], message: 'Photo extension and MIME type do not match' });
  });
});

const backupV3Schema = z.object({
  format: z.literal('trackitbetter-backup'),
  version: z.literal(3),
  exportedAt: timestamp,
  data: backupDataObject.extend({
    progressPhotos: z.array(photoAssetSchema).max(500),
    // Kept optional so backups produced during the v2 pose rollout remain valid.
    poseCaptures: z.array(poseCaptureAssetSchema).max(500).optional(),
  }).strict().superRefine((data, ctx) => {
    validateBackupData(data, ctx);
  }),
}).strict().superRefine(({ data }, ctx) => {
  const seen = new Set<string>();
  data.progressPhotos.forEach((photo, index) => {
    if (seen.has(photo.id)) ctx.addIssue({ code: 'custom', path: ['data', 'progressPhotos', index, 'id'], message: 'Duplicate id' });
    seen.add(photo.id);
    const expectedMime = photo.fileName.endsWith('.png') ? 'image/png' : photo.fileName.endsWith('.webp') ? 'image/webp' : photo.fileName.endsWith('.heic') ? 'image/heic' : photo.fileName.endsWith('.heif') ? 'image/heif' : 'image/jpeg';
    if (photo.mimeType !== expectedMime) ctx.addIssue({ code: 'custom', path: ['data', 'progressPhotos', index, 'mimeType'], message: 'Photo extension and MIME type do not match' });
  });
});

const backupSchema = z.union([backupV1Schema, backupV2Schema, backupV3Schema]);

export type LocalBackup = z.infer<typeof backupSchema>;

async function insertInChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let index = 0; index < rows.length; index += 40) {
    await insert(rows.slice(index, index + 40));
  }
}

type BackupSet = z.infer<typeof setSchema>;

/** Give each imported pair a fresh id while keeping its two sides together. */
function regeneratePairIds(sets: readonly BackupSet[], skipPairs = new Set<string>()): BackupSet[] {
  const replacements = new Map<string, string>();
  return sets
    .filter((set) => set.pairId === null || !skipPairs.has(set.pairId))
    .map((set) => {
      if (set.pairId === null) return set;
      let pairId = replacements.get(set.pairId);
      if (!pairId) {
        pairId = Crypto.randomUUID();
        replacements.set(set.pairId, pairId);
      }
      return { ...set, pairId };
    });
}

function pairMembers(sets: readonly BackupSet[]): Map<string, BackupSet[]> {
  const pairs = new Map<string, BackupSet[]>();
  sets.forEach((set) => {
    if (set.pairId === null) return;
    const members = pairs.get(set.pairId) ?? [];
    members.push(set);
    pairs.set(set.pairId, members);
  });
  return pairs;
}

/** What a backup file holds: everything, the workouts started in a date range, or only the exercise library. */
export type BackupScope =
  | { kind: 'full' }
  | { kind: 'workouts'; from: Date; to: Date }
  | { kind: 'library' };

/** How an import meets local data: replace everything, or add rows whose ids are not there yet. */
export type ImportMode = 'replace' | 'merge';

/**
 * Read local tables into a portable, versioned backup object. A partial scope keeps the same
 * format with the other tables empty, and still carries every exercise and progression chain
 * its workouts reference so the file validates and imports on its own.
 */
export async function createBackup(scope: BackupScope = { kind: 'full' }): Promise<LocalBackup> {
  if (scope.kind !== 'full') return createPartialBackup(scope);
  await initializeDatabase();
  const [exerciseRows, chainRows, criteriaRows, workoutRows, entryRows, setRows, measurementRows, settingRows, photoRows, poseRows] = await Promise.all([
    db.select().from(exercises),
    db.select().from(progressionChains),
    db.select().from(levelCriteria),
    db.select().from(workouts),
    db.select().from(exerciseEntries),
    db.select().from(trainingSets),
    db.select().from(bodyMeasurements),
    db.select().from(settings),
    db.select().from(progressPhotos),
    db.select().from(poseCaptures),
  ]);
  const photos = await Promise.all(photoRows.map(async (row) => ({
    ...row,
    takenAt: row.takenAt.toISOString(),
    base64: await getProgressPhotoFile(row.fileName).base64(),
  })));
  const poses = await Promise.all(poseRows.map(async (row) => ({
    ...row,
    side: row.side === 'left' || row.side === 'right' ? row.side : null,
    mediaKind: row.mediaKind === 'frame' ? 'frame' : 'photo',
    capturedAt: row.capturedAt.toISOString(),
    base64: await getPoseCaptureFile(row.fileName).base64(),
  })));
  return backupSchema.parse({
    format: 'trackitbetter-backup',
    version: 3,
    exportedAt: new Date().toISOString(),
    data: {
      exercises: exerciseRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      progressionChains: chainRows,
      levelCriteria: criteriaRows,
      workouts: workoutRows.map((row) => ({ ...row, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null })),
      exerciseEntries: entryRows,
      trainingSets: setRows.map((row) => ({ ...row, completedAt: row.completedAt?.toISOString() ?? null })),
      bodyMeasurements: measurementRows.map((row) => ({ ...row, measuredAt: row.measuredAt.toISOString() })),
      settings: settingRows,
      progressPhotos: photos,
      poseCaptures: poses,
    },
  });
}

async function createPartialBackup(scope: Exclude<BackupScope, { kind: 'full' }>): Promise<LocalBackup> {
  await initializeDatabase();
  const [exerciseRows, chainRows, criteriaRows] = await Promise.all([
    db.select().from(exercises),
    db.select().from(progressionChains),
    db.select().from(levelCriteria),
  ]);
  let workoutRows: (typeof workouts.$inferSelect)[] = [];
  let entryRows: (typeof exerciseEntries.$inferSelect)[] = [];
  let setRows: (typeof trainingSets.$inferSelect)[] = [];
  let keptExercises = exerciseRows;
  if (scope.kind === 'workouts') {
    const from = scope.from.getTime();
    const to = scope.to.getTime();
    workoutRows = (await db.select().from(workouts))
      .filter((row) => row.endedAt !== null && row.startedAt.getTime() >= from && row.startedAt.getTime() <= to);
    const workoutIds = new Set(workoutRows.map(({ id }) => id));
    entryRows = (await db.select().from(exerciseEntries)).filter((row) => workoutIds.has(row.workoutId));
    const entryIds = new Set(entryRows.map(({ id }) => id));
    setRows = (await db.select().from(trainingSets)).filter((row) => entryIds.has(row.entryId));
    const usedExercises = new Set(entryRows.map(({ exerciseId }) => exerciseId));
    keptExercises = exerciseRows.filter(({ id }) => usedExercises.has(id));
  }
  const chainIds = new Set(keptExercises.flatMap(({ chainId }) => (chainId ? [chainId] : [])));
  const keptChains = scope.kind === 'library' ? chainRows : chainRows.filter(({ id }) => chainIds.has(id));
  const keptChainIds = new Set(keptChains.map(({ id }) => id));
  return backupSchema.parse({
    format: 'trackitbetter-backup',
    version: 3,
    exportedAt: new Date().toISOString(),
    data: {
      exercises: keptExercises.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      progressionChains: keptChains,
      levelCriteria: criteriaRows.filter(({ chainId }) => keptChainIds.has(chainId)),
      workouts: workoutRows.map((row) => ({ ...row, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null })),
      exerciseEntries: entryRows,
      trainingSets: setRows.map((row) => ({ ...row, completedAt: row.completedAt?.toISOString() ?? null })),
      bodyMeasurements: [],
      settings: [],
      progressPhotos: [],
      poseCaptures: [],
    },
  });
}

/** Serialize a fresh local backup as JSON for a file/share workflow. */
export async function exportBackup(scope: BackupScope = { kind: 'full' }): Promise<string> {
  return JSON.stringify(await createBackup(scope), null, 2);
}

/** Parse and fully validate a backup before any database writes are attempted. */
export function parseBackup(input: string): LocalBackup {
  return backupSchema.parse(JSON.parse(input));
}

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output = new Uint8Array((value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0));
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const block = (alphabet.indexOf(value[index]) << 18)
      | (alphabet.indexOf(value[index + 1]) << 12)
      | (Math.max(0, alphabet.indexOf(value[index + 2])) << 6)
      | Math.max(0, alphabet.indexOf(value[index + 3]));
    if (offset < output.length) output[offset++] = (block >> 16) & 255;
    if (offset < output.length) output[offset++] = (block >> 8) & 255;
    if (offset < output.length) output[offset++] = block & 255;
  }
  return output;
}

/**
 * Add a validated backup to local data in one transaction, keeping every local row: rows whose
 * id already exists (an exercise you edited, a workout imported before) are skipped. Settings,
 * photos and pose captures are left out so a merge never changes the device's own setup.
 */
export async function mergeBackup(input: string): Promise<void> {
  const { data } = parseBackup(input);
  const date = (value: string) => new Date(value);
  await initializeDatabase();
  // If either side of an imported pair already exists locally, skip the whole
  // pair. Inserting only the other side would silently turn a complete pair into
  // a half-pair. Fresh pair ids also prevent an imported pair from attaching to
  // a local pair that happens to use the same source id.
  const existingSetIds = new Set((await db.select({ id: trainingSets.id }).from(trainingSets)).map(({ id }) => id));
  const blockedPairs = new Set<string>();
  pairMembers(data.trainingSets).forEach((members, pairId) => {
    if (members.some(({ id }) => existingSetIds.has(id))) blockedPairs.add(pairId);
  });
  const importedSets = regeneratePairIds(data.trainingSets, blockedPairs);
  await db.transaction(async (tx) => {
    await insertInChunks(data.progressionChains, async (rows) => {
      await tx.insert(progressionChains).values(rows).onConflictDoNothing();
    });
    await insertInChunks(data.exercises, async (rows) => {
      await tx.insert(exercises).values(rows.map((row) => ({ ...normalizeExerciseClassification(row), extraCategories: row.extraCategories ?? '[]', createdAt: date(row.createdAt) }))).onConflictDoNothing();
    });
    await insertInChunks(data.levelCriteria, async (rows) => {
      await tx.insert(levelCriteria).values(rows).onConflictDoNothing();
    });
    await insertInChunks(data.workouts, async (rows) => {
      await tx.insert(workouts).values(rows.map((row) => ({
        ...row,
        startedAt: date(row.startedAt),
        endedAt: row.endedAt ? date(row.endedAt) : null,
      }))).onConflictDoNothing();
    });
    await insertInChunks(data.exerciseEntries, async (rows) => {
      await tx.insert(exerciseEntries).values(rows).onConflictDoNothing();
    });
    await insertInChunks(importedSets, async (rows) => {
      await tx.insert(trainingSets).values(rows.map((row) => ({
        ...row,
        note: row.note ?? null,
        completedAt: row.completedAt ? date(row.completedAt) : null,
      }))).onConflictDoNothing();
    });
    await insertInChunks(data.bodyMeasurements, async (rows) => {
      await tx.insert(bodyMeasurements).values(rows.map((row) => ({ ...row, measuredAt: date(row.measuredAt) }))).onConflictDoNothing();
    });
  });
}

/** Import a backup either by replacing all local data or by merging it in. */
export async function importBackup(input: string, mode: ImportMode = 'replace'): Promise<void> {
  if (mode === 'merge') return mergeBackup(input);
  return replaceWithBackup(input);
}

/** Replace all supported local data atomically with the validated backup. */
async function replaceWithBackup(input: string): Promise<void> {
  const backup = parseBackup(input);
  const { data } = backup;
  const photoAssets = 'progressPhotos' in data ? data.progressPhotos : [];
  const poseAssets = 'poseCaptures' in data ? data.poseCaptures ?? [] : [];
  const importedSets = regeneratePairIds(data.trainingSets);
  const date = (value: string) => new Date(value);
  await initializeDatabase();
  const oldPhotos = await db.select().from(progressPhotos);
  const oldVideos = await db.select().from(formCheckVideos);
  const oldPoses = await db.select().from(poseCaptures);
  const restoreDir = new Directory(Paths.cache, `tib-photo-restore-${Crypto.randomUUID()}`);
  const installedFiles: File[] = [];
  const stagedPhotos: { id: string; fileName: string; mimeType: string; width: number; height: number; note: string; takenAt: Date }[] = [];
  const stagedPoses: (Omit<(typeof poseAssets)[number], 'base64' | 'capturedAt'> & { capturedAt: Date })[] = [];
  await preparePhotoDirectory();
  preparePoseCaptureDirectory();
  restoreDir.create({ idempotent: true, intermediates: true });
  try {
    for (const [index, photo] of photoAssets.entries()) {
      const extension = photo.fileName.slice(photo.fileName.lastIndexOf('.') + 1).toLowerCase();
      const fileName = `${Crypto.randomUUID()}.${extension}`;
      const stagedFile = new File(restoreDir, `${index}.${extension}`);
      stagedFile.create({ overwrite: true, intermediates: true });
      stagedFile.write(decodeBase64(photo.base64));
      const storedFile = getProgressPhotoFile(fileName);
      await stagedFile.copy(storedFile);
      installedFiles.push(storedFile);
      stagedPhotos.push({
        id: photo.id,
        fileName,
        mimeType: photo.mimeType,
        width: photo.width,
        height: photo.height,
        note: photo.note,
        takenAt: date(photo.takenAt),
      });
    }

    for (const [index, { base64, capturedAt, ...metadata }] of poseAssets.entries()) {
      const fileName = `${Crypto.randomUUID()}.jpg`;
      const stagedFile = new File(restoreDir, `pose-${index}.jpg`);
      stagedFile.create({ overwrite: true, intermediates: true });
      stagedFile.write(decodeBase64(base64));
      const storedFile = getPoseCaptureFile(fileName);
      await stagedFile.copy(storedFile);
      installedFiles.push(storedFile);
      stagedPoses.push({ ...metadata, fileName, capturedAt: date(capturedAt) });
    }

    await db.transaction(async (tx) => {
    await tx.delete(trainingSets);
    await tx.delete(exerciseEntries);
    await tx.delete(workouts);
    await tx.delete(bodyMeasurements);
    await tx.delete(progressPhotos);
    await tx.delete(poseCaptures);
    await tx.delete(settings);
    await tx.delete(levelCriteria);
    await tx.delete(exercises);
    await tx.delete(progressionChains);

    await insertInChunks(data.progressionChains, async (rows) => {
      await tx.insert(progressionChains).values(rows);
    });
    await insertInChunks(data.exercises, async (rows) => {
      await tx.insert(exercises).values(rows.map((row) => ({
        ...normalizeExerciseClassification(row),
        extraCategories: row.extraCategories ?? '[]',
        createdAt: date(row.createdAt),
      })));
    });
    await insertInChunks(data.levelCriteria, async (rows) => {
      await tx.insert(levelCriteria).values(rows);
    });
    await insertInChunks(data.workouts, async (rows) => {
      await tx.insert(workouts).values(rows.map((row) => ({
        ...row,
        startedAt: date(row.startedAt),
        endedAt: row.endedAt ? date(row.endedAt) : null,
      })));
    });
    await insertInChunks(data.exerciseEntries, async (rows) => {
      await tx.insert(exerciseEntries).values(rows);
    });
    await insertInChunks(importedSets, async (rows) => {
      await tx.insert(trainingSets).values(rows.map((row) => ({
        ...row,
        note: row.note ?? null,
        completedAt: row.completedAt ? date(row.completedAt) : null,
      })));
    });
    await insertInChunks(data.bodyMeasurements, async (rows) => {
      await tx.insert(bodyMeasurements).values(rows.map((row) => ({ ...row, measuredAt: date(row.measuredAt) })));
    });
    await insertInChunks(data.settings, async (rows) => {
      await tx.insert(settings).values(rows);
    });
      await insertInChunks(stagedPhotos, async (rows) => {
        await tx.insert(progressPhotos).values(rows);
      });
      await insertInChunks(stagedPoses, async (rows) => {
        await tx.insert(poseCaptures).values(rows);
      });
    });
  } catch (error) {
    installedFiles.forEach((file) => { if (file.exists) file.delete(); });
    throw error;
  } finally {
    if (restoreDir.exists) restoreDir.delete();
  }
  oldPhotos.forEach((photo) => {
    const file = getProgressPhotoFile(photo.fileName);
    if (file.exists) file.delete();
  });
  oldPoses.forEach((capture) => {
    const file = getPoseCaptureFile(capture.fileName);
    if (file.exists) file.delete();
  });
  oldVideos.forEach((video) => {
    const file = getFormCheckVideoFile(video.fileName);
    if (file.exists) file.delete();
  });
}
