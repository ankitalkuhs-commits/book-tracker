import React, { useState, useEffect, createContext, useRef } from 'react';
import { View, Text, Animated, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, userAPI, userbooksAPI, notesAPI, notificationsAPI, importAPI, activityAPI, groupsAPI } from './src/services/api';
import { registerExpoPushToken } from './src/services/NotificationService';
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import AppTour, { TOUR_KEY } from './src/components/AppTour';
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

const SLIDES = [
  { emoji: '📚', text: 'Track your reading journey' },
  { emoji: '✍️', text: 'Journal your thoughts & notes' },
  { emoji: '👥', text: 'Connect with fellow readers' },
  { emoji: '🌟', text: 'Discover your next favourite read' },
];

export default function App() {
  const [fontsLoaded, setFontsLoaded]   = useState(false);
  const [authChecked, setAuthChecked]   = useState(false);
  const [isLoggedIn, setIsLoggedIn]     = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [preloaded, setPreloaded]       = useState(null);
  const [showTour, setShowTour] = useState(false);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [slideIndex, setSlideIndex]     = useState(0);
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const pollRef    = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // ── Load custom fonts ────────────────────────────────────────────────────
  useEffect(() => {
    Font.loadAsync(fontMap)
      .catch(() => {}) // non-fatal — fall back to system font
      .finally(() => setFontsLoaded(true));
  }, []);

  // ── Slide carousel animation (runs while loading or transitioning) ────────
  const ready = fontsLoaded && authChecked;
  useEffect(() => {
    if (ready && !transitioning) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setSlideIndex(prev => (prev + 1) % SLIDES.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 1800);
    return () => clearInterval(interval);
  }, [ready, transitioning]);

  // ── Auth check on mount ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const loggedIn = await authAPI.isLoggedIn();
      if (loggedIn) {
        await preloadData();
        const tourDone = await AsyncStorage.getItem(TOUR_KEY).catch(() => null);
        setIsLoggedIn(true);
        if (!tourDone) setShowTour(true);
      }
      setAuthChecked(true);
    })();
  }, []);

  // ── Preload common data to avoid waterfall loading in tabs ───────────────
  const preloadData = async () => {
    try {
      const [profile, library, feed, count, insights, activity, notes, groups, pendingGroups] = await Promise.allSettled([
        userAPI.getProfile(),
        userbooksAPI.getMyBooks(),
        notesAPI.getCommunityFeed(50),
        notificationsAPI.getUnreadCount(),
        activityAPI.getInsights(),
        activityAPI.getMyActivity(30),
        notesAPI.getMyNotes(),
        groupsAPI.getMyGroups(),
        groupsAPI.getMyPendingGroups(),
      ]);
      setPreloaded({
        profile:       profile.status       === 'fulfilled' ? profile.value       : null,
        library:       library.status       === 'fulfilled' ? library.value       : [],
        feed:          feed.status          === 'fulfilled' ? feed.value          : [],
        insights:      insights.status      === 'fulfilled' ? insights.value      : null,
        activity:      activity.status      === 'fulfilled' ? activity.value      : [],
        notes:         notes.status         === 'fulfilled' ? notes.value         : [],
        groups:        groups.status        === 'fulfilled' ? groups.value        : [],
        pendingGroups: pendingGroups.status === 'fulfilled' ? pendingGroups.value : [],
      });
      if (count.status === 'fulfilled') setUnreadCount(count.value?.unread ?? 0);
    } catch { /* non-critical — screens will load their own data */ }

    // Silently fix any books missing covers in the background
    _silentCoverFix();
  };

  const _silentCoverFix = async () => {
    try {
      const status = await importAPI.getCoversStatus();
      const ids = status.book_ids || [];
      if (ids.length === 0) return;
      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        await importAPI.fixCoversBatch(ids.slice(i, i + BATCH)).catch(() => {});
      }
    } catch { /* fully silent — never surface errors to user */ }
  };

  // ── Notification badge polling ───────────────────────────────────────────
  const fetchUnread = async () => {
    try {
      const data = await notificationsAPI.getUnreadCount();
      setUnreadCount(data?.unread ?? 0);
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
    setTransitioning(true);
    await preloadData();
    const tourDone = await AsyncStorage.getItem(TOUR_KEY).catch(() => null);
    setTransitioning(false);
    setIsLoggedIn(true);
    if (!tourDone) setShowTour(true);
  };

  const handleLogout = async () => {
    clearInterval(pollRef.current);
    setPreloaded(null);
    setUnreadCount(0);
    setShowTour(false);
    setIsLoggedIn(false);
  };

  // ── Loading splash — wait for both fonts + auth ──────────────────────────
  if (ready) SplashScreen.hideAsync().catch(() => {});

  if (!ready) {
    const slide = SLIDES[slideIndex];
    return (
      <View style={styles.splash}>
        <Text style={styles.splashLogo}>📖</Text>
        <Text style={styles.splashTitle}>TrackMyRead</Text>
        <Animated.View style={[styles.slideWrap, { opacity: fadeAnim }]}>
          <Text style={styles.slideEmoji}>{slide.emoji}</Text>
          <Text style={styles.slideText}>{slide.text}</Text>
        </Animated.View>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === slideIndex && styles.dotActive]} />
          ))}
        </View>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 32 }} />
      </View>
    );
  }

  // ── Post-login transition — show carousel while preloading data ─────────
  if (transitioning) {
    const slide = SLIDES[slideIndex];
    return (
      <View style={styles.splash}>
        <Text style={styles.splashLogo}>📖</Text>
        <Text style={styles.splashTitle}>TrackMyRead</Text>
        <Animated.View style={[styles.slideWrap, { opacity: fadeAnim }]}>
          <Text style={styles.slideEmoji}>{slide.emoji}</Text>
          <Text style={styles.slideText}>{slide.text}</Text>
        </Animated.View>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === slideIndex && styles.dotActive]} />
          ))}
        </View>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 32 }} />
      </View>
    );
  }

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <SafeAreaProvider>
      <NotificationContext.Provider value={{ unreadCount }}>
        <PreloadContext.Provider value={{
            ...(preloaded || {}),
            updateProfile: (patch) =>
              setPreloaded(prev => ({ ...prev, profile: { ...(prev?.profile || {}), ...patch } })),
          }}>
          <NavigationContainer>
            <AppNavigator onLogout={handleLogout} />
          </NavigationContainer>
          {showTour && <AppTour onDone={() => setShowTour(false)} />}
        </PreloadContext.Provider>
      </NotificationContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, paddingHorizontal: 40 },
  splashLogo:  { fontSize: 64, marginBottom: 12 },
  splashTitle: { fontSize: 28, fontWeight: '700', color: colors.primary, letterSpacing: -0.5, marginBottom: 56 },
  slideWrap:   { alignItems: 'center', minHeight: 110, justifyContent: 'center' },
  slideEmoji:  { fontSize: 48, marginBottom: 14 },
  slideText:   { fontSize: 16, fontWeight: '500', color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 24 },
  dots:        { flexDirection: 'row', gap: 6, marginTop: 28 },
  dot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.outlineVariant },
  dotActive:   { backgroundColor: colors.primary, width: 18 },
});
