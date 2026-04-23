import { createContext } from 'react';

// Provides unreadCount (number) to any component in the tree.
// Value is set by App.js and consumed by AppHeader.
export const NotificationContext = createContext({ unreadCount: 0 });
