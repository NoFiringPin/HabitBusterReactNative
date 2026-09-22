import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Returns null if permission is (now) granted, or a user-facing error string. */
export async function ensureNotificationPermission(): Promise<string | null> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return null;
  if (!current.canAskAgain) {
    return 'Notifications are turned off for HabitBuster. Enable them in Settings to use Passive mode.';
  }
  const requested = await Notifications.requestPermissionsAsync();
  if (!requested.granted) {
    return 'Notification permission is needed for Passive mode. Enable it in Settings and try again.';
  }
  return null;
}

/** Fire an immediate local notification (not a scheduled/future one). */
export async function fireDetectionNotification(behaviorName?: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'HabitBuster',
      body: behaviorName ? `Caught: ${behaviorName}` : 'A habit was just detected.',
      sound: true,
    },
    trigger: null,
  });
}
