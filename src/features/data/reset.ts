import { count } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db, initializeDatabase } from '../../db/client';
import {
  bodyMeasurements,
  exerciseEntries,
  exercises,
  formCheckVideos,
  levelCriteria,
  poseCaptures,
  progressionChains,
  progressPhotos,
  settings,
  trainingSets,
  workouts,
} from '../../db/schema';
import { seedCatalogIfEmpty } from '../../db/seed/import';
import { getFormCheckVideoFile } from '../media/formVideos';
import { getProgressPhotoFile } from '../photos/repository';
import { getPoseCaptureFile } from '../pose/repository';
import { expandScopes, type ResetScope } from './resetScopes';

export { expandScopes, RESET_SCOPES, type ResetScope } from './resetScopes';

export interface DataSummary {
  workouts: number;
  measurements: number;
  photos: number;
  poseChecks: number;
  savedItems: number;
}

export async function getDataSummary(): Promise<DataSummary> {
  await initializeDatabase();
  const total = async (table: typeof workouts | typeof bodyMeasurements | typeof progressPhotos | typeof poseCaptures | typeof settings) => {
    const [row] = await db.select({ value: count() }).from(table);
    return row?.value ?? 0;
  };
  const [workoutCount, measurements, photos, poseChecks, savedItems] = await Promise.all([
    total(workouts), total(bodyMeasurements), total(progressPhotos), total(poseCaptures), total(settings),
  ]);
  return { workouts: workoutCount, measurements, photos, poseChecks, savedItems };
}

/**
 * Deletes the chosen data. Database rows go in one transaction; the image and video files they
 * pointed at are removed only after it commits, so a failed reset leaves everything in place.
 */
export async function resetData(scopes: readonly ResetScope[]): Promise<void> {
  const clear = expandScopes(scopes);
  if (clear.size === 0) return;
  await initializeDatabase();
  const files = [
    ...(clear.has('workouts') ? (await db.select({ fileName: formCheckVideos.fileName }).from(formCheckVideos)).map((row) => getFormCheckVideoFile(row.fileName)) : []),
    ...(clear.has('body') ? (await db.select({ fileName: progressPhotos.fileName }).from(progressPhotos)).map((row) => getProgressPhotoFile(row.fileName)) : []),
    ...(clear.has('pose') ? (await db.select({ fileName: poseCaptures.fileName }).from(poseCaptures)).map((row) => getPoseCaptureFile(row.fileName)) : []),
  ];

  await db.transaction(async (tx) => {
    if (clear.has('workouts')) {
      await tx.delete(formCheckVideos);
      await tx.delete(trainingSets);
      await tx.delete(exerciseEntries);
      await tx.delete(workouts);
    }
    if (clear.has('body')) {
      await tx.delete(bodyMeasurements);
      await tx.delete(progressPhotos);
    }
    if (clear.has('pose')) await tx.delete(poseCaptures);
    if (clear.has('plans')) await tx.delete(settings);
    if (clear.has('everything')) {
      await tx.delete(levelCriteria);
      await tx.delete(exercises);
      await tx.delete(progressionChains);
    }
  });
  if (clear.has('everything')) await seedCatalogIfEmpty(db);

  for (const file of files) {
    try {
      if (file.exists) file.delete();
    } catch {
      // A leftover file is harmless: nothing refers to it any more.
    }
  }
  if (clear.has('plans') && Platform.OS !== 'web') {
    // Reminders live in the system scheduler, not the database.
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  }
}
