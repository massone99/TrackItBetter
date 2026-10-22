import { asc, eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { db, initializeDatabase } from '../../db/client';
import { exerciseImages } from '../../db/schema';
import { downscale } from '../photos/repository';

/** A picture of how an exercise looks (a start or end position, a key moment), shown on the exercise's page. */
export type ExerciseImage = typeof exerciseImages.$inferSelect & { uri: string };

/** Longest edge of a stored exercise picture: enough for a full-screen view, small for a library of them. */
const MAX_EDGE = 1280;
/** Pictures one exercise can carry. */
export const MAX_EXERCISE_IMAGES = 12;

function getImageDirectory(): Directory {
  return new Directory(Paths.document, 'exercise-images');
}

export function getExerciseImageFile(fileName: string): File {
  return new File(getImageDirectory(), fileName);
}

export function prepareExerciseImageDirectory(): void {
  const directory = getImageDirectory();
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
}

function deleteFile(fileName: string): void {
  const file = getExerciseImageFile(fileName);
  if (file.exists) file.delete();
}

export async function listExerciseImages(exerciseId: string): Promise<ExerciseImage[]> {
  await initializeDatabase();
  const rows = await db.select().from(exerciseImages).where(eq(exerciseImages.exerciseId, exerciseId)).orderBy(asc(exerciseImages.position), asc(exerciseImages.createdAt));
  return rows.map((row) => ({ ...row, uri: getExerciseImageFile(row.fileName).uri }));
}

/** Shrinks a picked or captured image, stores it in app-private storage and adds it after the others. */
export async function addExerciseImage(exerciseId: string, input: { sourceUri: string; mimeType: string; width: number; height: number }): Promise<void> {
  await initializeDatabase();
  const current = await listExerciseImages(exerciseId);
  if (current.length >= MAX_EXERCISE_IMAGES) throw new RangeError('Too many images');
  prepareExerciseImageDirectory();
  const image = await downscale(input, MAX_EDGE);
  const extension = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : image.mimeType === 'image/heic' ? 'heic' : image.mimeType === 'image/heif' ? 'heif' : 'jpg';
  const id = Crypto.randomUUID();
  const fileName = `${id}.${extension}`;
  // The re-encoded copy lives in the cache, so it is moved; a picked original is copied.
  if (image.temporary) await new File(image.uri).move(getExerciseImageFile(fileName));
  else await new File(image.uri).copy(getExerciseImageFile(fileName));
  try {
    const position = current.reduce((max, item) => Math.max(max, item.position + 1), 0);
    await db.insert(exerciseImages).values({ id, exerciseId, fileName, mimeType: image.mimeType, width: image.width, height: image.height, position, createdAt: new Date() });
  } catch (error) {
    deleteFile(fileName);
    throw error;
  }
}

export async function deleteExerciseImage(id: string): Promise<void> {
  await initializeDatabase();
  const [row] = await db.select().from(exerciseImages).where(eq(exerciseImages.id, id)).limit(1);
  if (!row) return;
  await db.delete(exerciseImages).where(eq(exerciseImages.id, id));
  deleteFile(row.fileName);
}

/** Moves a picture one place earlier (-1) or later (+1) among the exercise's pictures. */
export async function moveExerciseImage(id: string, delta: -1 | 1): Promise<void> {
  await initializeDatabase();
  const [row] = await db.select().from(exerciseImages).where(eq(exerciseImages.id, id)).limit(1);
  if (!row) return;
  const images = await listExerciseImages(row.exerciseId);
  const index = images.findIndex((image) => image.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= images.length) return;
  [images[index], images[target]] = [images[target], images[index]];
  await db.transaction(async (tx) => {
    for (const [position, image] of images.entries()) await tx.update(exerciseImages).set({ position }).where(eq(exerciseImages.id, image.id));
  });
}

/** The files of an exercise's pictures, read before the exercise is deleted (its rows go with it, ON DELETE CASCADE). */
export async function exerciseImageFileNames(exerciseId: string): Promise<string[]> {
  const rows = await db.select({ fileName: exerciseImages.fileName }).from(exerciseImages).where(eq(exerciseImages.exerciseId, exerciseId));
  return rows.map((row) => row.fileName);
}

/** Deletes picture files once their rows are gone. */
export function deleteExerciseImageFileNames(fileNames: readonly string[]): void {
  fileNames.forEach(deleteFile);
}
