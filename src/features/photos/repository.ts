import { eq, desc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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

/** Longest edge of a stored progress photo: sharp on a phone screen, a fraction of a camera original. */
const MAX_EDGE = 1600;

interface StoredImage { uri: string; mimeType: string; width: number; height: number; temporary: boolean }

/**
 * Re-encodes the image as an upright JPEG no larger than MAX_EDGE on its long side. When the
 * image cannot be decoded (an unusual format), the original is kept as it is.
 */
async function downscale(input: { sourceUri: string; mimeType: string; width: number; height: number }): Promise<StoredImage> {
  try {
    const context = ImageManipulator.manipulate(input.sourceUri);
    if (Math.max(input.width, input.height) > MAX_EDGE) {
      context.resize(input.width >= input.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return { uri: saved.uri, mimeType: 'image/jpeg', width: saved.width, height: saved.height, temporary: true };
  } catch {
    return { uri: input.sourceUri, mimeType: input.mimeType, width: input.width, height: input.height, temporary: false };
  }
}

/** Shrink a picked or captured image, then store it in app-private storage before indexing it. */
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
  const image = await downscale(input);
  const extension = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : image.mimeType === 'image/heic' ? 'heic' : image.mimeType === 'image/heif' ? 'heif' : 'jpg';
  const id = Crypto.randomUUID();
  const fileName = `${id}.${extension}`;
  // The re-encoded copy lives in the cache, so it is moved; a picked original is copied.
  if (image.temporary) await new File(image.uri).move(fileFor(fileName));
  else await new File(image.uri).copy(fileFor(fileName));
  try {
    await db.insert(progressPhotos).values({
      id,
      fileName,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
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
