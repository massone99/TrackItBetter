import { Alert, Linking } from 'react-native';
import type { TFunction } from 'i18next';

/**
 * Tells the user a permission was refused. When Android will not ask again (refused twice, or "Don't allow"), the
 * only way back is the system settings, so the dialog opens them instead of leaving a dead end.
 */
export function alertPermissionDenied(t: TFunction, title: string, body: string, permission: { canAskAgain?: boolean }): void {
  if (permission.canAskAgain !== false) {
    Alert.alert(title, body);
    return;
  }
  Alert.alert(title, body, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.openSettings'), onPress: () => { void Linking.openSettings(); } },
  ]);
}
