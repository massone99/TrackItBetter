import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, poseCaptures, trainingSets, workouts } from '../../db/schema';
import type { Pose, PoseSide, PositionId } from '../../domain/pose';

/** What an analysis belongs to: an exercise and, optionally, one of its logged sets. */
export type PoseLink = {
  exerciseId: string;
  exerciseName: string;
  set: { id: string; number: number | null; side: string; workoutId: string; workoutStartedAt: Date } | null;
};

/**
 * The number a set shows in its workout: working sets count up (an L/R pair shares one number),
 * warm-ups have none.
 */
const setNumberSql = sql<number | null>`CASE WHEN ${trainingSets.kind} = 'working' THEN (SELECT COUNT(*) FROM training_set AS other
  WHERE other.entry_id = ${trainingSets.entryId} AND other.kind = 'working' AND other.side != 'right' AND other.set_index <= ${trainingSets.index}) END`;

export type PoseCapture = Omit<typeof poseCaptures.$inferSelect, 'keypoints'> & { pose: Pose; uri: string; link: PoseLink | null };

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
  exerciseId?: string | null;
  setId?: string | null;
  /** When the photo or video was taken; now by default. */
  capturedAt?: Date;
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
      capturedAt: input.capturedAt ?? new Date(),
      exerciseId: input.exerciseId ?? null,
      setId: input.exerciseId ? input.setId ?? null : null,
    });
  } catch (error) {
    if (file.exists) file.delete();
    throw error;
  }
  return id;
}

/** Analyses, newest first; optionally only one position's, or only those of an exercise or a set. */
export async function listPoseCaptures(positionId?: string, filter: { exerciseId?: string; setId?: string } = {}): Promise<PoseCapture[]> {
  await initializeDatabase();
  const rows = await db.select({
    capture: poseCaptures,
    exerciseName: exercises.name,
    setNumber: setNumberSql,
    setSide: trainingSets.side,
    workoutId: workouts.id,
    workoutStartedAt: workouts.startedAt,
  }).from(poseCaptures)
    .leftJoin(exercises, eq(poseCaptures.exerciseId, exercises.id))
    .leftJoin(trainingSets, eq(poseCaptures.setId, trainingSets.id))
    .leftJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .leftJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(
      positionId ? eq(poseCaptures.positionId, positionId) : undefined,
      filter.exerciseId ? eq(poseCaptures.exerciseId, filter.exerciseId) : undefined,
      filter.setId ? eq(poseCaptures.setId, filter.setId) : undefined,
    ))
    .orderBy(desc(poseCaptures.capturedAt));
  return rows.map(({ capture: { keypoints, ...row }, exerciseName, setNumber, setSide, workoutId, workoutStartedAt }) => ({
    ...row,
    pose: parsePose(keypoints),
    uri: getPoseCaptureFile(row.fileName).uri,
    link: row.exerciseId && exerciseName !== null ? {
      exerciseId: row.exerciseId,
      exerciseName,
      set: row.setId && workoutId !== null && workoutStartedAt !== null
        ? { id: row.setId, number: setNumber, side: setSide ?? 'both', workoutId, workoutStartedAt: new Date(workoutStartedAt) }
        : null,
    } : null,
  }));
}

/** Links an analysis to an exercise and, optionally, one of its sets; null unlinks it. */
export async function linkPoseCapture(id: string, link: { exerciseId: string; setId: string | null } | null): Promise<void> {
  await initializeDatabase();
  await db.update(poseCaptures).set({ exerciseId: link?.exerciseId ?? null, setId: link ? link.setId : null }).where(eq(poseCaptures.id, id));
}

/** The link for an analysis started from a logged set: its exercise and the set itself. */
export async function getSetLink(setId: string): Promise<PoseLink | null> {
  await initializeDatabase();
  const [row] = await db.select({
    exerciseId: exerciseEntries.exerciseId, exerciseName: exercises.name, number: setNumberSql, side: trainingSets.side,
    workoutId: workouts.id, workoutStartedAt: workouts.startedAt,
  }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(eq(trainingSets.id, setId))
    .limit(1);
  if (!row) return null;
  return { exerciseId: row.exerciseId, exerciseName: row.exerciseName, set: { id: setId, number: row.number, side: row.side, workoutId: row.workoutId, workoutStartedAt: row.workoutStartedAt } };
}

export type LinkableSet = {
  id: string; index: number; number: number | null; side: string; kind: string; reps: number | null; durationSec: number | null;
  distanceM: number | null; addedLoadKg: number; done: boolean; workoutId: string; workoutStartedAt: Date;
};

/** The sets of an exercise in its most recent workouts (the open one included), newest workout first. */
export async function listLinkableSets(exerciseId: string, workoutLimit = 6): Promise<LinkableSet[]> {
  await initializeDatabase();
  const recent = await db.selectDistinct({ id: workouts.id, startedAt: workouts.startedAt })
    .from(exerciseEntries)
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .innerJoin(trainingSets, eq(trainingSets.entryId, exerciseEntries.id))
    .where(and(eq(exerciseEntries.exerciseId, exerciseId), or(isNotNull(trainingSets.completedAt), isNull(workouts.endedAt))))
    .orderBy(desc(workouts.startedAt))
    .limit(workoutLimit);
  if (recent.length === 0) return [];
  const rows = await db.select({
    id: trainingSets.id, index: trainingSets.index, side: trainingSets.side, kind: trainingSets.kind, reps: trainingSets.reps,
    durationSec: trainingSets.durationSec, distanceM: trainingSets.distanceM, addedLoadKg: trainingSets.addedLoadKg,
    completedAt: trainingSets.completedAt, workoutId: workouts.id, workoutStartedAt: workouts.startedAt,
  }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(eq(exerciseEntries.exerciseId, exerciseId), inArray(workouts.id, recent.map((workout) => workout.id))));
  const sorted = rows.sort((a, b) => b.workoutStartedAt.getTime() - a.workoutStartedAt.getTime() || a.index - b.index);
  const counters = new Map<string, number>();
  return sorted.map(({ completedAt, ...row }) => {
    let number: number | null = null;
    if (row.kind === 'working') {
      const count = (counters.get(row.workoutId) ?? 0) + (row.side === 'right' ? 0 : 1);
      counters.set(row.workoutId, count);
      number = Math.max(1, count);
    }
    return { ...row, number, done: completedAt !== null };
  });
}

/** How many free analyses are linked to an exercise, for the exercise page. */
export async function countPoseCapturesForExercise(exerciseId: string): Promise<number> {
  await initializeDatabase();
  const rows = await db.select({ id: poseCaptures.id }).from(poseCaptures)
    .where(and(eq(poseCaptures.exerciseId, exerciseId), eq(poseCaptures.positionId, 'free')));
  return rows.length;
}

/** How many analyses each set of a workout has. */
export async function countPoseCapturesBySet(workoutId: string): Promise<Map<string, number>> {
  await initializeDatabase();
  const rows = await db.select({ setId: poseCaptures.setId }).from(poseCaptures)
    .innerJoin(trainingSets, eq(poseCaptures.setId, trainingSets.id))
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .where(eq(exerciseEntries.workoutId, workoutId));
  const counts = new Map<string, number>();
  for (const row of rows) if (row.setId) counts.set(row.setId, (counts.get(row.setId) ?? 0) + 1);
  return counts;
}

export async function deletePoseCapture(id: string): Promise<void> {
  await initializeDatabase();
  const [row] = await db.select({ fileName: poseCaptures.fileName }).from(poseCaptures).where(eq(poseCaptures.id, id)).limit(1);
  if (!row) return;
  await db.delete(poseCaptures).where(eq(poseCaptures.id, id));
  const file = getPoseCaptureFile(row.fileName);
  if (file.exists) file.delete();
}
