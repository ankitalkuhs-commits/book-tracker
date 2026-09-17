// NotificationService.js
// Handles Expo push token registration so the backend can deliver notifications.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { userAPI, authAPI } from './api';

const EXPO_PROJECT_ID =
  Constants?.expoConfig?.extra?.eas?.projectId ||
  Constants?.easConfig?.projectId ||
  '9b559417-a211-4e49-8ef2-806f7acf9d88';

let registrationInProgress = false;
let lastRegisteredExpoToken = null;
let registrationEpoch = 0;

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

// ─── Reset the push registration guard (F-03) ─────────────────────────────────
// Called on sign-out, session expiry and before deregistering. The epoch stops
// an in-flight registration for the account that just signed out from re-arming
// the guard once its request resolves.
export function resetPushRegistration() {
  lastRegisteredExpoToken = null;
  registrationEpoch += 1;
}

// ─── Get Expo push token and register it with the backend ────────────────────
export async function registerExpoPushToken() {
  if (registrationInProgress) return;
  try {
    registrationInProgress = true;
    const epoch = registrationEpoch;
    if (!EXPO_PROJECT_ID || !(await authAPI.isLoggedIn())) return;

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    let tokenResult;
    try {
      tokenResult = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    } catch (tokenErr) {
      if (__DEV__) console.error('[Push] getExpoPushTokenAsync failed:', tokenErr?.message);
      return;
    }

    const expoPushToken = tokenResult?.data;
    if (!expoPushToken) return;
    if (lastRegisteredExpoToken === expoPushToken) return;

    await userAPI.registerPushToken(expoPushToken);
    if (epoch === registrationEpoch) lastRegisteredExpoToken = expoPushToken;
    if (__DEV__) console.log('[Push] Token registered successfully');
  } catch (err) {
    if (__DEV__) console.warn('[Push] Error registering push token:', err?.message);
  } finally {
    registrationInProgress = false;
  }
}

// ─── Remove token from backend on logout ─────────────────────────────────────
export async function deregisterPushToken() {
  resetPushRegistration();
  try {
    await userAPI.deregisterPushToken();
  } catch (err) {
    if (__DEV__) console.warn('[Push] Error deregistering push token:', err?.message);
  }
}
