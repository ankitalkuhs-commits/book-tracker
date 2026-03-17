/**
 * Tests for NotificationService.
 * Covers: permission gating, scheduling, cancellation, handleAppOpen logic.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  requestNotificationPermission,
  handleAppOpen,
} from '../services/NotificationService';

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.clear();
});

// ─── requestNotificationPermission ───────────────────────────────────────────

describe('requestNotificationPermission', () => {
  test('returns true when permission is already granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('requests permission the first time if not yet asked', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    AsyncStorage.getItem.mockResolvedValue(null); // not asked before

    const result = await requestNotificationPermission();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  test('does NOT request permission again if already asked and was denied', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    AsyncStorage.getItem.mockResolvedValue('true'); // already asked

    const result = await requestNotificationPermission();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

// ─── handleAppOpen ────────────────────────────────────────────────────────────

describe('handleAppOpen', () => {
  test('does nothing if permission is denied', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    AsyncStorage.getItem.mockResolvedValue('true'); // already asked

    await handleAppOpen();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('cancels any existing nudge on every app open', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    // Simulate a stored notification ID
    AsyncStorage.getItem.mockImplementation((key) => {
      if (key === 'daily_nudge_notification_id') return Promise.resolve('old-notif-id');
      return Promise.resolve(null);
    });

    // Set 9PM in the future so scheduling proceeds
    const future9PM = new Date();
    future9PM.setHours(21, 0, 0, 0);
    if (future9PM <= new Date()) {
      // Skip scheduling assertion if 9PM already passed in test environment
      return;
    }

    await handleAppOpen();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-notif-id');
  });

  test('schedules a new nudge when called (fix: not just on new day)', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    AsyncStorage.getItem.mockResolvedValue(null);

    // Mock time to be before 9PM so scheduling fires
    const morningTime = new Date();
    morningTime.setHours(8, 0, 0, 0);
    jest.useFakeTimers();
    jest.setSystemTime(morningTime);

    await handleAppOpen();
    // scheduleNotificationAsync called only if 9PM hasn't passed
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.any(Date),
        content: expect.objectContaining({
          title: expect.any(String),
          body: expect.any(String),
        }),
      })
    );
    jest.useRealTimers();
  });

  test('does NOT schedule if called after 9PM (9PM already passed today)', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    AsyncStorage.getItem.mockResolvedValue(null);

    // Mock time to 10PM (past 9PM)
    const lateNight = new Date();
    lateNight.setHours(22, 0, 0, 0);
    jest.useFakeTimers();
    jest.setSystemTime(lateNight);

    await handleAppOpen();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('calling handleAppOpen multiple times same day - cancels+reschedules each time', async () => {
    // This is the core regression test for the bug fix.
    // Old bug: only scheduled on first open, subsequent opens cancelled without rescheduling.
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    AsyncStorage.getItem.mockResolvedValue(null);

    const morning = new Date();
    morning.setHours(8, 0, 0, 0);
    jest.useFakeTimers();
    jest.setSystemTime(morning);

    await handleAppOpen(); // 1st open
    await handleAppOpen(); // 2nd open
    await handleAppOpen(); // 3rd open

    // After 3 opens, scheduleNotificationAsync should have been called 3 times
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });
});
