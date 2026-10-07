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

/** One rest alert at a time: a new one takes the place of the previous, scheduled or already shown. */
const REST_ALERT_ID = 'workout-rest-end';

async function cancelExistingRestAlerts(): Promise<void> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  const shown = await Notifications.getPresentedNotificationsAsync();
  await Promise.all([
    ...requests
      .filter((request) => request.content.data?.restTimer === true)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
    ...shown
      .filter((item) => item.request.content.data?.restTimer === true)
      .map((item) => Notifications.dismissNotificationAsync(item.request.identifier)),
  ]);
}

/** Asks once; later calls respect the answer. */
async function notificationsAllowed(): Promise<boolean> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  if (!permission.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Shows the countdown in the notification shade and on the lock screen (Android; the system ticks
 * it, so it stays exact with the app in the background) and schedules an alert for the exact end of
 * the rest, so a phone in standby still shows when the rest is over. Both replace what an earlier
 * rest left behind.
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
    identifier: REST_ALERT_ID,
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

async function cancelExistingEmomAlerts(): Promise<void> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(requests
    .filter((request) => request.content.data?.emomTimer === true)
    .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

/** One alert per round change, so a phone in a pocket or in standby still marks every minute. */
export async function scheduleEmomNotifications(alerts: readonly { at: number; title: string; body: string }[]): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelExistingEmomAlerts();
  if (!(await notificationsAllowed())) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
      name: 'Workout rest timer',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const now = Date.now();
  for (const alert of alerts.filter((item) => item.at > now).slice(0, 60)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: alert.title, body: alert.body, sound: true, autoDismiss: true, priority: Notifications.AndroidNotificationPriority.MAX, data: { emomTimer: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alert.at, ...(Platform.OS === 'android' ? { channelId: REST_CHANNEL_ID } : {}) },
    });
  }
}

export async function cancelEmomNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelExistingEmomAlerts();
}
