// NotificationService.js
// Handles Expo push token registration so the backend can deliver notifications.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const API_BASE_URL = 'https://book-tracker-backend-0hiz.onrender.com';
const EXPO_PROJECT_ID = '9b559417-a211-4e49-8ef2-806f7acf9d88';

// ─── Show notifications when app is in foreground ────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Request permission + set up Android channel ─────────────────────────────
export async function requestNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: true,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') {
    console.log('[Push] Notification permission already granted');
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  console.log('[Push] Notification permission result:', status);
  return status === 'granted';
}

// ─── Get Expo push token and register it with the backend ────────────────────
export async function registerExpoPushToken(authToken) {
  try {
    if (!authToken) {
      console.warn('[Push] No auth token available — skipping push token registration');
      return;
    }

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.log('[Push] Permission denied — token not registered');
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    if (!expoPushToken) {
      console.warn('[Push] Could not get Expo push token');
      return;
    }

    console.log('[Push] Expo token generated:', expoPushToken);

    const response = await fetch(`${API_BASE_URL}/push-tokens/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: expoPushToken }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.warn('[Push] Backend registration failed:', response.status, responseText);
      return;
    }

    console.log('[Push] Token registered with backend:', responseText || 'OK');
  } catch (err) {
    console.warn('[Push] Error registering push token:', err);
  }
}

// ─── Remove token from backend on logout ─────────────────────────────────────
export async function deregisterPushToken(authToken) {
  try {
    if (!authToken) return;

    const response = await fetch(`${API_BASE_URL}/push-tokens/`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.warn('[Push] Backend deregistration failed:', response.status, responseText);
      return;
    }

    console.log('[Push] Token deregistered:', responseText || 'OK');
  } catch (err) {
    console.warn('[Push] Error deregistering push token:', err);
  }
}
