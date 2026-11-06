import { Linking, Platform } from 'react-native';

/** Intent action of the StretchStrong app that opens an exercise's details (images and videos) by `exercise_id`. */
export const STRETCHSTRONG_ACTION = 'com.jujimufu.compose.OPEN_EXERCISE';

/**
 * Opens an exercise in the StretchStrong app: first its link (`stretchstrong://exercise/<id>`, a VIEW intent), then, on Android,
 * its own action with the id as an extra. Returns false when neither could be started (the app is not installed).
 */
export async function openStretchStrong(exerciseId: string): Promise<boolean> {
  try {
    await Linking.openURL(`stretchstrong://exercise/${exerciseId}`);
    return true;
  } catch { /* try the action below */ }
  if (Platform.OS !== 'android') return false;
  try {
    const { startActivityAsync } = await import('expo-intent-launcher');
    await startActivityAsync(STRETCHSTRONG_ACTION, { extra: { exercise_id: exerciseId } });
    return true;
  } catch {
    return false;
  }
}
