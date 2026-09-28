import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportBackup } from './backup';

/**
 * Writes a JSON backup to the cache and opens the share sheet so it can be saved elsewhere.
 * Resolves to 'unavailable' when the device cannot share files.
 */
export async function shareBackupFile(dialogTitle: string): Promise<'shared' | 'unavailable'> {
  const contents = await exportBackup();
  const file = new File(Paths.cache, `trackitbetter-backup-${new Date().toISOString().slice(0, 10)}.json`);
  file.create({ overwrite: true });
  file.write(contents);
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle, UTI: 'public.json' });
  return 'shared';
}
