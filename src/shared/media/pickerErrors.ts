/**
 * Android only: after the activity was recreated, expo-image-picker cannot open any picker until the
 * app is restarted. The message tells the person what to do instead of showing the raw native error.
 */
export function isPickerUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('unregistered ActivityResultLauncher');
}
