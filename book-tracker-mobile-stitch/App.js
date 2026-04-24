import React, { useState, useEffect, createContext, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { authAPI, userAPI, userbooksAPI, notesAPI, notificationsAPI } from './src/services/api';
import { registerExpoPushToken } from './src/services/NotificationService';
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import { colors, fontMap } from './src/theme';
import { NotificationContext } from './src/context/NotificationContext';

// Keep splash visible until fonts + auth check are done
SplashScreen.preventAutoHideAsync().catch(() => {});

// ── Preload context (consumed by FeedScreen, LibraryScreen, ProfileScreen) ───
export const PreloadContext = createContext(null);

// Notification tap handler — navigate on tap
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const [fontsLoaded, setFontsLoaded]   = useState(false);
  const [authChecked, setAuthChecked]   = useState(false);
  const [isLoggedIn, setIsLoggedIn]     = useState(false);
  const [preloaded, setPreloaded]       = useState(null);
  const [unreadCount, setUnreadCount]   = useState(0);
  const pollRef    = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // ── Load custom fonts ────────────────────────────────────────────────────
  useEffect(() => {
    Font.loadAsync(fontMap)
      .catch(() => {}) // non-fatal — fall back to system font
      .finally(() => setFontsLoaded(true));
  }, []);

  // ── Auth check on mount ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const loggedIn = await authAPI.isLoggedIn();
      if (loggedIn) {
        await preloadData();
        setIsLoggedIn(true);
      }
      setAuthChecked(true);
    })();
  }, []);

  // ── Preload common data to avoid waterfall loading in tabs ───────────────
  const preloadData = async () => {
    try {
      const [profile, library, feed, count] = await Promise.allSettled([
        userAPI.getProfile(),
        userbooksAPI.getMyBooks(),
        notesAPI.getFriendsFeed(20),
        notificationsAPI.getUnreadCount(),
      ]);
      setPreloaded({
        profile: profile.status === 'fulfilled' ? profile.value : null,
        library: library.status === 'fulfilled' ? library.value : [],
        feed:    feed.status    === 'fulfilled' ? feed.value    : [],
      });
      if (count.status === 'fulfilled') setUnreadCount(count.value?.count ?? 0);
    } catch { /* non-critical — screens will load their own data */ }
  };

  // ── Notification badge polling ───────────────────────────────────────────
  const fetchUnread = async () => {
    try {
      const data = await notificationsAPI.getUnreadCount();
      setUnreadCount(data?.count ?? 0);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchUnread();
    pollRef.current = setInterval(fetchUnread, 60_000);

    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        fetchUnread();
      }
      appStateRef.current = next;
    });

    return () => {
      clearInterval(pollRef.current);
      sub.remove();
    };
  }, [isLoggedIn]);

  // ── Push notification registration ──────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    authAPI.getToken().then(token => registerExpoPushToken(token)).catch(() => {});
  }, [isLoggedIn]);

  // ── Login / Logout ───────────────────────────────────────────────────────
  const handleLoginSuccess = async () => {
    await preloadData();
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    clearInterval(pollRef.current);
    setPreloaded(null);
    setUnreadCount(0);
    setIsLoggedIn(false);
  };

  // ── Loading splash — wait for both fonts + auth ──────────────────────────
  const ready = fontsLoaded && authChecked;
  if (ready) SplashScreen.hideAsync().catch(() => {});

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <NotificationContext.Provider value={{ unreadCount }}>
      <PreloadContext.Provider value={preloaded}>
        <NavigationContainer>
          <AppNavigator onLogout={handleLogout} />
        </NavigationContainer>
      </PreloadContext.Provider>
    </NotificationContext.Provider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
