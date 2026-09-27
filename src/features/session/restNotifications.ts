import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REST_CHANNEL_ID = 'workout-rest-timer';

async function cancelExistingRestAlerts(): Promise<void> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(requests
    .filter((request) => request.content.data?.restTimer === true)
    .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

/** Schedules a background alert for the active rest interval, if notifications are already allowed. */
export async function scheduleRestFinishedNotification(seconds: number, title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelExistingRestAlerts();
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
      name: 'Workout rest timer',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
    });
  }
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, data: { restTimer: true } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.floor(seconds)),
      ...(Platform.OS === 'android' ? { channelId: REST_CHANNEL_ID } : {}),
    },
  });
}

export async function cancelRestFinishedNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelExistingRestAlerts();
}
