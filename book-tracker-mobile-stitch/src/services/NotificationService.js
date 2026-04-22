// NotificationService.js
// Handles Expo push token registration so the backend can deliver notifications.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_BASE_URL = 'https://book-tracker-stitch.onrender.com'; // Stitch backend
const EXPO_PROJECT_ID =
  Constants?.expoConfig?.extra?.eas?.projectId ||
  Constants?.easConfig?.projectId ||
  '9b559417-a211-4e49-8ef2-806f7acf9d88';

let registrationInProgress = false;
let lastRegisteredExpoToken = null;

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
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Get Expo push token and register it with the backend ────────────────────
export async function registerExpoPushToken(authToken) {
  if (registrationInProgress) return;
  try {
    registrationInProgress = true;
    if (!authToken || !EXPO_PROJECT_ID) return;

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    let tokenResult;
    try {
      tokenResult = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    } catch (tokenErr) {
      console.error('[Push] getExpoPushTokenAsync failed:', tokenErr?.message);
      return;
    }

    const expoPushToken = tokenResult?.data;
    if (!expoPushToken) return;
    if (lastRegisteredExpoToken === expoPushToken) return;

    const response = await fetch(`${API_BASE_URL}/push-tokens/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: expoPushToken }),
    });

    if (!response.ok) {
      console.warn('[Push] Backend registration failed:', response.status);
      return;
    }

    lastRegisteredExpoToken = expoPushToken;
    console.log('[Push] Token registered successfully');
  } catch (err) {
    console.warn('[Push] Error registering push token:', err);
  } finally {
    registrationInProgress = false;
  }
}

// ─── Remove token from backend on logout ─────────────────────────────────────
export async function deregisterPushToken(authToken) {
  try {
    if (!authToken) return;
    lastRegisteredExpoToken = null;

    const response = await fetch(`${API_BASE_URL}/push-tokens/`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) console.warn('[Push] Backend deregistration failed:', response.status);
  } catch (err) {
    console.warn('[Push] Error deregistering push token:', err);
  }
}
