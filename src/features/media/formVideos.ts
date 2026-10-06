import { asc, desc, eq, inArray } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, formCheckVideos, trainingSets, workouts } from '../../db/schema';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type FormCheckVideo = typeof formCheckVideos.$inferSelect & {
  uri: string;
  workoutName: string;
  setIndex: number;
};

export interface FormCheckSetContext {
  workoutId: string;
  workoutName: string;
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
}

function fileFor(fileName: string): File {
  return new File(getVideoDirectory(), fileName);
}

function ensureVideoDirectory(): void {
  const videoDirectory = getVideoDirectory();
  if (!videoDirectory.exists) videoDirectory.create({ idempotent: true, intermediates: true });
}

function getVideoDirectory(): Directory {
  return new Directory(Paths.document, 'form-check-videos');
}

export async function getFormCheckSetContext(setId: string): Promise<FormCheckSetContext | null> {
  await initializeDatabase();
  const [row] = await db.select({
    workoutId: workouts.id,
    workoutName: workouts.name,
    exerciseId: exercises.id,
    exerciseName: exercises.name,
    setIndex: trainingSets.index,
  }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .where(eq(trainingSets.id, setId)).limit(1);
  return row ?? null;
}

/** Copies a selected or recorded clip into app-private storage and attaches it to its set. */
export async function addFormCheckVideo(input: {
  setId: string;
  sourceUri: string;
  durationMs: number;
  fileSize?: number | null;
  recordedAt?: Date;
}): Promise<void> {
  const context = await getFormCheckSetContext(input.setId);
  if (!context) throw new Error('Set could not be found');
  if (!Number.isFinite(input.durationMs) || input.durationMs <= 0 || input.durationMs > 60_000) {
    throw new RangeError('Form-check clips must be between 1 and 60 seconds');
  }
  if (input.fileSize != null && input.fileSize > MAX_VIDEO_BYTES) {
    throw new RangeError('Video file exceeds 100 MB');
  }
  ensureVideoDirectory();
  const id = Crypto.randomUUID();
  const fileName = `${id}.mp4`;
  const destination = fileFor(fileName);
  await new File(input.sourceUri).copy(destination);
  try {
    const info = await destination.info();
    const fileSize = info.size ?? input.fileSize ?? null;
    if (fileSize !== null && fileSize > MAX_VIDEO_BYTES) {
      throw new RangeError('Video file exceeds 100 MB');
    }
    await db.insert(formCheckVideos).values({
      id,
      fileName,
      workoutId: context.workoutId,
      exerciseId: context.exerciseId,
      setId: input.setId,
      durationMs: Math.round(input.durationMs),
      fileSize,
      recordedAt: input.recordedAt ?? new Date(),
    });
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
}

export async function listFormCheckVideos(exerciseId: string): Promise<FormCheckVideo[]> {
  await initializeDatabase();
  const rows = await db.select({
    video: formCheckVideos,
    workoutName: workouts.name,
    setIndex: trainingSets.index,
  }).from(formCheckVideos)
    .innerJoin(trainingSets, eq(formCheckVideos.setId, trainingSets.id))
    .innerJoin(workouts, eq(formCheckVideos.workoutId, workouts.id))
    .where(eq(formCheckVideos.exerciseId, exerciseId))
    .orderBy(desc(formCheckVideos.recordedAt), asc(formCheckVideos.id));
  return rows.map(({ video, workoutName, setIndex }) => ({ ...video, workoutName, setIndex, uri: fileFor(video.fileName).uri }));
}

export async function deleteFormCheckVideo(videoId: string): Promise<void> {
  await initializeDatabase();
  const [row] = await db.select().from(formCheckVideos)
    .where(eq(formCheckVideos.id, videoId)).limit(1);
  if (!row) return;
  await db.delete(formCheckVideos).where(eq(formCheckVideos.id, videoId));
  const file = fileFor(row.fileName);
  if (file.exists) file.delete();
}

/** Removes every clip attached to the given sets, both the rows and the files on disk. */
export async function deleteFormCheckVideosForSets(setIds: string[]): Promise<void> {
  if (setIds.length === 0) return;
  await initializeDatabase();
  const rows = await db.select({ fileName: formCheckVideos.fileName }).from(formCheckVideos)
    .where(inArray(formCheckVideos.setId, setIds));
  await db.delete(formCheckVideos).where(inArray(formCheckVideos.setId, setIds));
  for (const row of rows) {
    try {
      const file = fileFor(row.fileName);
      if (file.exists) file.delete();
    } catch {
      // A missing or locked file must not block removing the set itself.
    }
  }
}

export function getFormCheckVideoFile(fileName: string): File {
  return fileFor(fileName);
}

/** Clip files of removed rows that an undo may still put back; the sweep leaves them alone. */
const retainedClipFiles = new Set<string>();

export function retainClipFiles(fileNames: readonly string[]): void {
  for (const fileName of fileNames) retainedClipFiles.add(fileName);
}

export function releaseClipFiles(fileNames: readonly string[]): void {
  for (const fileName of fileNames) retainedClipFiles.delete(fileName);
}

function deleteClipFile(file: File): boolean {
  try {
    if (!file.exists) return false;
    file.delete();
    return true;
  } catch {
    // A locked or already removed file is left for the next sweep.
    return false;
  }
}

/** Deletes the given clip files unless a form-check row still points to them (e.g. after a restore). */
export async function deleteClipFilesIfUnused(fileNames: readonly string[]): Promise<void> {
  if (fileNames.length === 0) return;
  await initializeDatabase();
  const used = new Set((await db.select({ fileName: formCheckVideos.fileName }).from(formCheckVideos)
    .where(inArray(formCheckVideos.fileName, [...fileNames]))).map((row) => row.fileName));
  for (const fileName of fileNames) {
    if (!used.has(fileName) && !retainedClipFiles.has(fileName)) deleteClipFile(fileFor(fileName));
  }
}

/** Files this recent may belong to a clip whose row is still being written. */
const SWEEP_GRACE_MS = 60 * 60_000;

/**
 * Deletes clip files that no form-check row points to: left behind when the app closed while a
 * removal could still be undone, or by a failed save. Files kept for an undo in progress and very
 * recent files are skipped. Returns how many files were deleted.
 */
export async function sweepOrphanClipFiles(now = Date.now()): Promise<number> {
  await initializeDatabase();
  const directory = getVideoDirectory();
  if (!directory.exists) return 0;
  const used = new Set((await db.select({ fileName: formCheckVideos.fileName }).from(formCheckVideos)).map((row) => row.fileName));
  let deleted = 0;
  for (const item of directory.list()) {
    if (!(item instanceof File) || used.has(item.name) || retainedClipFiles.has(item.name)) continue;
    const modified = item.lastModified ?? item.creationTime;
    if (modified == null || now - modified < SWEEP_GRACE_MS) continue;
    if (deleteClipFile(item)) deleted += 1;
  }
  return deleted;
}
