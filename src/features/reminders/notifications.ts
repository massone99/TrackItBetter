import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const REMINDER_ID = "workout-reminder";
const CHANNEL_ID = "workout-reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  weekdays: number[];
};

export type ReminderPermission = "granted" | "denied" | "undetermined";

export async function getReminderPermission(): Promise<ReminderPermission> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return "granted";
  }
  if (permission.canAskAgain) return "undetermined";
  return "denied";
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Workout reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await getReminderPermission();
  if (current === "granted" || current === "denied") return current;
  const requested = await Notifications.requestPermissionsAsync();
  if (requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return "granted";
  }
  return requested.canAskAgain ? "undetermined" : "denied";
}

function isReminderNotification(request: Notifications.NotificationRequest) {
  return request.content.data?.reminderId === REMINDER_ID;
}

function readSettings(requests: Notifications.NotificationRequest[]): ReminderSettings | null {
  const reminderRequests = requests.filter(isReminderNotification);
  if (reminderRequests.length === 0) return null;
  const triggerParts = reminderRequests.map(({ trigger }) => getWeeklyTriggerParts(trigger));
  const first = triggerParts[0];
  if (!first) return null;
  const weekdays = triggerParts.flatMap((parts) => parts?.weekday ? [parts.weekday] : []);
  return { enabled: true, hour: first.hour, minute: first.minute, weekdays: [...new Set(weekdays)].sort() };
}

type ReminderTriggerShape = {
  type?: string;
  hour?: number;
  minute?: number;
  weekday?: number;
  dateComponents?: { hour?: number; minute?: number; weekday?: number };
};

function getWeeklyTriggerParts(trigger: Notifications.NotificationRequest['trigger']) {
  if (!trigger || typeof trigger !== 'object') return null;
  const shape = trigger as unknown as ReminderTriggerShape;
  if (shape.type !== 'weekly' && shape.type !== 'calendar') return null;
  const parts = shape.dateComponents ?? shape;
  if (parts.hour == null || parts.minute == null) return null;
  return { hour: parts.hour, minute: parts.minute, weekday: parts.weekday ?? shape.weekday };
}

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const settings = readSettings(await Notifications.getAllScheduledNotificationsAsync());
  return settings ?? { enabled: false, hour: 18, minute: 0, weekdays: [2, 4, 6] };
}

export async function saveReminderSettings(settings: ReminderSettings, title: string, body: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = scheduled.filter(isReminderNotification);
  if (!settings.enabled) {
    await Promise.all(existing.map(({ identifier }) => Notifications.cancelScheduledNotificationAsync(identifier)));
    return;
  }

  const created: string[] = [];
  try {
    for (const weekday of [...new Set(settings.weekdays)].sort()) {
      created.push(await Notifications.scheduleNotificationAsync({
        content: { title, body, data: { reminderId: REMINDER_ID } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: settings.hour,
          minute: settings.minute,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        },
      }));
    }
  } catch (error) {
    await Promise.all(created.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)));
    throw error;
  }

  await Promise.all(existing.map(({ identifier }) => Notifications.cancelScheduledNotificationAsync(identifier)));
}
