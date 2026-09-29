import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportBackup, type BackupScope } from './backup';

/**
 * Writes a JSON backup to the cache and opens the share sheet so it can be saved elsewhere.
 * Resolves to 'unavailable' when the device cannot share files.
 */
export async function shareBackupFile(dialogTitle: string, scope: BackupScope = { kind: 'full' }): Promise<'shared' | 'unavailable'> {
  const contents = await exportBackup(scope);
  const day = (value: Date) => value.toISOString().slice(0, 10);
  const suffix = scope.kind === 'workouts' ? `-workouts-${day(scope.from)}_${day(scope.to)}` : scope.kind === 'library' ? '-library' : '';
  const file = new File(Paths.cache, `trackitbetter-backup${suffix}-${day(new Date())}.json`);
  file.create({ overwrite: true });
  file.write(contents);
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle, UTI: 'public.json' });
  return 'shared';
}
