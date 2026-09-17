import { createContext } from 'react';

// Provides unreadCount (number) and refreshUnread() to any component in the
// tree. Value is set by App.js and consumed by AppHeader / NotificationsScreen.
export const NotificationContext = createContext({ unreadCount: 0, refreshUnread: () => {} });
