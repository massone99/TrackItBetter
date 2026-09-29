import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { RestTimer } from '../../../modules/rest-timer/src';

const REST_CHANNEL_ID = 'workout-rest-timer';

export interface RestNotificationText {
  /** End alert. */
  title: string;
  body: string;
  /** Title of the ongoing countdown notification. */
  countdown: string;
  /** Android settings name of the countdown channel. */
  channel: string;
}

async function cancelExistingRestAlerts(): Promise<void> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(requests
    .filter((request) => request.content.data?.restTimer === true)
    .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

/** Asks once; later calls respect the answer. */
async function notificationsAllowed(): Promise<boolean> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  if (!permission.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Shows a lock-screen countdown (Android) and schedules an alert for the exact end of the rest,
 * so a phone in standby still shows when the rest is over.
 */
export async function scheduleRestFinishedNotification(seconds: number, text: RestNotificationText): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelExistingRestAlerts();
  if (!(await notificationsAllowed())) return;
  const endsAt = Date.now() + Math.max(1, Math.floor(seconds)) * 1000;
  RestTimer?.show(endsAt, text.countdown, text.channel);
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
      name: 'Workout rest timer',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: text.title,
      body: text.body,
      sound: true,
      sticky: false,
      autoDismiss: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { restTimer: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: endsAt,
      ...(Platform.OS === 'android' ? { channelId: REST_CHANNEL_ID } : {}),
    },
  });
}

export async function cancelRestFinishedNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  RestTimer?.hide();
  await cancelExistingRestAlerts();
}
