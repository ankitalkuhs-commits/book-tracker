// NotificationService.js
// Handles daily reading nudge notifications at 9PM if user hasn't opened the app
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ─── Nudge Message Pool (Round-Robin) ───────────────────────────────────────
const NUDGE_MESSAGES = [
  { title: '📚 Your book is waiting!', body: "Even 5 pages makes a difference. Open up and keep going!" },
  { title: '🔥 Keep the streak alive!', body: "You've been building a great reading habit. Don't stop now!" },
  { title: '✨ Time to read today', body: "A few pages before bed? Your future self will thank you." },
  { title: '📖 Pick up where you left off', body: "Your book is right where you left it. Ready to dive back in?" },
  { title: '🌙 Evening reading time!', body: "Wind down with a good book tonight. Open TrackMyRead!" },
  { title: '💡 Readers are leaders', body: "The best readers read every day. You've got this!" },
  { title: "🎯 Hit today's reading goal", body: "A little reading goes a long way. Open the app and log your pages!" },
  { title: '🌟 Your reading journey continues', body: "Every page brings you closer to finishing. Keep it up!" },
  { title: '📚 Books don\'t read themselves!', body: "Give your book some attention tonight — it misses you 😄" },
  { title: '🍵 Perfect reading weather', body: "Grab a drink, get comfy, and read a few pages tonight." },
  { title: '🧠 Feed your mind today', body: "You haven't logged any reading yet today. Now's a great time!" },
  { title: '⚡ Quick reading session?', body: "Even 10 minutes of reading counts. Open TrackMyRead!" },
  { title: '🌿 Unwind with your book', body: "Step away from screens... with a different screen 😄 and your book!" },
  { title: '🏆 Readers who track, finish', body: "Tracking your progress keeps you motivated. Log your pages!" },
  { title: '📝 How\'s the book going?', body: "Haven't heard from you today! Log your reading progress." },
  { title: '🌙 Bedtime reading reminder', body: "Reading before bed improves sleep. Open your book tonight!" },
  { title: '✍️ Track today\'s reading', body: "Don't forget to log your pages — keep your stats up to date!" },
  { title: '💬 Your book community awaits', body: "Share what you're reading with fellow readers today!" },
  { title: '📚 One chapter closer', body: "You're so close! Open TrackMyRead and keep the momentum going." },
  { title: '🔖 Your bookmark is waiting', body: "Right where you left off. Your book is ready when you are!" },
];

const STORAGE_KEYS = {
  NUDGE_INDEX: 'nudge_message_index',
  LAST_ACTIVE_DATE: 'last_active_date',
  NOTIFICATION_ID: 'daily_nudge_notification_id',
  PERMISSION_ASKED: 'notification_permission_asked',
};

// ─── Setup notification handler ─────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Request permission ──────────────────────────────────────────────────────
export async function requestNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily-nudge', {
      name: 'Daily Reading Nudge',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: true,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  // Only ask once
  const alreadyAsked = await AsyncStorage.getItem(STORAGE_KEYS.PERMISSION_ASKED);
  if (alreadyAsked) return false;

  await AsyncStorage.setItem(STORAGE_KEYS.PERMISSION_ASKED, 'true');
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Get next nudge message (round-robin) ───────────────────────────────────
async function getNextNudgeMessage() {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.NUDGE_INDEX);
  const currentIndex = stored ? parseInt(stored, 10) : 0;
  const message = NUDGE_MESSAGES[currentIndex % NUDGE_MESSAGES.length];
  const nextIndex = (currentIndex + 1) % NUDGE_MESSAGES.length;
  await AsyncStorage.setItem(STORAGE_KEYS.NUDGE_INDEX, String(nextIndex));
  return message;
}

// ─── Cancel existing scheduled nudge ─────────────────────────────────────────
async function cancelScheduledNudge() {
  const notifId = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_ID);
  if (notifId) {
    await Notifications.cancelScheduledNotificationAsync(notifId);
    await AsyncStorage.removeItem(STORAGE_KEYS.NOTIFICATION_ID);
  }
}

// ─── Schedule 9PM nudge for today ────────────────────────────────────────────
async function scheduleNudgeFor9PM() {
  const message = await getNextNudgeMessage();

  // Build trigger for 9PM today
  const now = new Date();
  const trigger = new Date();
  trigger.setHours(21, 0, 0, 0); // 9:00:00 PM

  // If 9PM has already passed today, skip (will be rescheduled tomorrow on next app open)
  if (trigger <= now) return;

  const notifId = await Notifications.scheduleNotificationAsync({
    content: {
      title: message.title,
      body: message.body,
      sound: true,
      data: { type: 'daily_nudge' },
    },
    trigger,
  });

  await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_ID, notifId);
  console.log(`📬 Nudge scheduled for 9PM: "${message.title}"`);
}

// ─── Main entry point: call this on every app open ───────────────────────────
// Logic:
//   - If user opens the app → cancel today's nudge (they're already active)
//   - Schedule tomorrow's nudge check (done automatically on next open)
export async function handleAppOpen() {
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    const today = new Date().toDateString();
    const lastActive = await AsyncStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_DATE);

    // Cancel any pending nudge for today since user opened the app
    await cancelScheduledNudge();

    // If it's a new day, schedule tonight's nudge
    if (lastActive !== today) {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_DATE, today);
      await scheduleNudgeFor9PM();
    }
  } catch (err) {
    console.warn('Notification service error:', err);
  }
}
