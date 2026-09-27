import { desc, eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { db, initializeDatabase } from '../../db/client';
import { poseCaptures } from '../../db/schema';
import type { Pose, PoseSide, PositionId } from '../../domain/pose';

export type PoseCapture = Omit<typeof poseCaptures.$inferSelect, 'keypoints'> & { pose: Pose; uri: string };

function captureDirectory(): Directory {
  return new Directory(Paths.document, 'pose-captures');
}

export function getPoseCaptureFile(fileName: string): File {
  return new File(captureDirectory(), fileName);
}

export function preparePoseCaptureDirectory(): void {
  const directory = captureDirectory();
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
}

function parsePose(value: string): Pose {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Pose) : [];
  } catch {
    return [];
  }
}

/** Copies the analysed image (already orientation-fixed JPEG) into app-private storage and indexes it. */
export async function savePoseCapture(input: {
  positionId: PositionId;
  side: PoseSide | null;
  value: number;
  level: number;
  pose: Pose;
  sourceUri: string;
  width: number;
  height: number;
  mediaKind: 'photo' | 'frame';
  note?: string;
}): Promise<string> {
  await initializeDatabase();
  preparePoseCaptureDirectory();
  const id = Crypto.randomUUID();
  const fileName = `${id}.jpg`;
  const file = getPoseCaptureFile(fileName);
  await new File(input.sourceUri).copy(file);
  try {
    await db.insert(poseCaptures).values({
      id,
      positionId: input.positionId,
      side: input.side,
      value: Math.round(input.value * 10) / 10,
      level: input.level,
      keypoints: JSON.stringify(input.pose.map(({ x, y, score }) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, score: Math.round(score * 1000) / 1000 }))),
      fileName,
      width: input.width,
      height: input.height,
      mediaKind: input.mediaKind,
      note: input.note?.trim() ?? '',
      capturedAt: new Date(),
    });
  } catch (error) {
    if (file.exists) file.delete();
    throw error;
  }
  return id;
}

export async function listPoseCaptures(positionId?: string): Promise<PoseCapture[]> {
  await initializeDatabase();
  const rows = await db.select().from(poseCaptures)
    .where(positionId ? eq(poseCaptures.positionId, positionId) : undefined)
    .orderBy(desc(poseCaptures.capturedAt));
  return rows.map(({ keypoints, ...row }) => ({ ...row, pose: parsePose(keypoints), uri: getPoseCaptureFile(row.fileName).uri }));
}

export async function deletePoseCapture(id: string): Promise<void> {
  await initializeDatabase();
  const [row] = await db.select({ fileName: poseCaptures.fileName }).from(poseCaptures).where(eq(poseCaptures.id, id)).limit(1);
  if (!row) return;
  await db.delete(poseCaptures).where(eq(poseCaptures.id, id));
  const file = getPoseCaptureFile(row.fileName);
  if (file.exists) file.delete();
}
