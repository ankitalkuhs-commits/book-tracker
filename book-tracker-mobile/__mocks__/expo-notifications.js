// Mock for expo-notifications
export const AndroidImportance = { DEFAULT: 3, HIGH: 4 };

export const getPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted' })
);
export const requestPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted' })
);
export const setNotificationChannelAsync = jest.fn(() => Promise.resolve());
export const setNotificationHandler = jest.fn();
export const scheduleNotificationAsync = jest.fn(() =>
  Promise.resolve('mock-notification-id-123')
);
export const cancelScheduledNotificationAsync = jest.fn(() => Promise.resolve());
export const getAllScheduledNotificationsAsync = jest.fn(() => Promise.resolve([]));
