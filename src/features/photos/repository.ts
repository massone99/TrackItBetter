import { eq, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { db, initializeDatabase } from '../../db/client';
import { progressPhotos } from '../../db/schema';

export type ProgressPhoto = typeof progressPhotos.$inferSelect & { uri: string };

function fileFor(fileName: string): File {
  return new File(getPhotoDirectory(), fileName);
}

async function ensurePhotoDirectory(): Promise<void> {
  const photoDirectory = getPhotoDirectory();
  if (!photoDirectory.exists) photoDirectory.create({ idempotent: true, intermediates: true });
}

function getPhotoDirectory(): Directory {
  return new Directory(Paths.document, 'progress-photos');
}

/** Copy a picked or captured image into app-private storage before indexing it. */
export async function addProgressPhoto(input: {
  sourceUri: string;
  mimeType: string;
  width: number;
  height: number;
  note?: string;
  takenAt?: Date;
}): Promise<void> {
  await initializeDatabase();
  await ensurePhotoDirectory();
  const extension = input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : input.mimeType === 'image/heic' ? 'heic' : input.mimeType === 'image/heif' ? 'heif' : 'jpg';
  const id = Crypto.randomUUID();
  const fileName = `${id}.${extension}`;
  await new File(input.sourceUri).copy(fileFor(fileName));
  try {
    await db.insert(progressPhotos).values({
      id,
      fileName,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      note: input.note?.trim() ?? '',
      takenAt: input.takenAt ?? new Date(),
    });
  } catch (error) {
    fileFor(fileName).delete();
    throw error;
  }
}

export async function listProgressPhotos(): Promise<ProgressPhoto[]> {
  await initializeDatabase();
  const rows = await db.select().from(progressPhotos).orderBy(desc(progressPhotos.takenAt));
  return rows.map((row) => ({ ...row, uri: fileFor(row.fileName).uri }));
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  await initializeDatabase();
  const [row] = await db.select().from(progressPhotos).where(eq(progressPhotos.id, id)).limit(1);
  if (!row) return;
  await db.delete(progressPhotos).where(eq(progressPhotos.id, id));
  const file = fileFor(row.fileName);
  if (file.exists) file.delete();
}

export function getProgressPhotoFile(fileName: string): File {
  return fileFor(fileName);
}

export async function preparePhotoDirectory(): Promise<void> {
  await ensurePhotoDirectory();
}
