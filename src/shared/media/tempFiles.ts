import { Directory, File, Paths } from 'expo-file-system';

/**
 * Cache folders and file names that only ever hold temporary copies: what the pickers hand over
 * (ImagePicker, DocumentPicker), re-encoded images (ImageManipulator), pose-analysis frames
 * (VideoThumbnails), share cards (ReactNative-snapshot-image), exported backups and chains
 * (trackitbetter-*) and restore staging (tib-photo-restore-*). Nothing else in the cache is touched:
 * other caches (images, fonts) manage their own size.
 */
const TEMP_DIRECTORIES = ['ImagePicker', 'ImageManipulator', 'VideoThumbnails', 'DocumentPicker'];
const TEMP_PREFIXES = ['trackitbetter-', 'tib-photo-restore-', 'ReactNative-snapshot-image'];

/** A temporary file this recent may still be in use (a share sheet reading it, an analysis in progress). */
export const TEMP_GRACE_MS = 60 * 60_000;

function modifiedAt(item: File): number | null {
  const stamp = item.lastModified ?? item.creationTime;
  return typeof stamp === 'number' && Number.isFinite(stamp) ? stamp : null;
}

function isTemporaryName(name: string): boolean {
  return TEMP_DIRECTORIES.includes(name) || TEMP_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Deletes old files under `directory`; removes emptied subfolders. Returns the bytes freed. */
function sweepDirectory(directory: Directory, cutoff: number, removeWhenEmpty: boolean): number {
  let freed = 0;
  for (const item of directory.list()) {
    try {
      if (item instanceof Directory) {
        freed += sweepDirectory(item, cutoff, true);
        continue;
      }
      const modified = modifiedAt(item);
      if (modified == null || modified > cutoff) continue;
      const size = item.size ?? 0;
      item.delete();
      freed += size;
    } catch {
      // A locked or already removed file is left for the next sweep.
    }
  }
  try {
    if (removeWhenEmpty && directory.exists && directory.list().length === 0) directory.delete();
  } catch {
    // An emptied folder that cannot be removed costs nothing.
  }
  return freed;
}

/**
 * Deletes the app's temporary copies older than an hour from the cache. The cache is never
 * emptied by Android until storage runs low, so without this every picked photo or video,
 * exported backup and share card stays there for good. Returns the bytes freed.
 */
export function sweepTemporaryFiles(now = Date.now()): number {
  const cache = Paths.cache;
  if (!cache?.exists) return 0;
  const cutoff = now - TEMP_GRACE_MS;
  let freed = 0;
  for (const item of cache.list()) {
    if (!isTemporaryName(item.name)) continue;
    try {
      if (item instanceof Directory) {
        // The pickers' own folders stay (they expect them); a restore staging folder goes once empty.
        freed += sweepDirectory(item, cutoff, !TEMP_DIRECTORIES.includes(item.name));
        continue;
      }
      const modified = modifiedAt(item);
      if (modified == null || modified > cutoff) continue;
      const size = item.size ?? 0;
      item.delete();
      freed += size;
    } catch {
      // Left for the next sweep.
    }
  }
  return freed;
}

/** True when the file lives in the app's cache, i.e. it is a temporary copy the app may delete. */
export function isCacheFile(uri: string): boolean {
  let cacheUri: string | undefined;
  try { cacheUri = Paths.cache?.uri; } catch { return false; }
  return !!cacheUri && uri.startsWith(cacheUri.endsWith('/') ? cacheUri : `${cacheUri}/`);
}

/** Deletes a picker's temporary copy once it has been stored; files outside the cache are never touched. */
export function discardTemporaryCopy(uri: string): void {
  if (!isCacheFile(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The startup sweep removes it later.
  }
}
