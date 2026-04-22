import React, { useState, useEffect, useRef, createContext } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, Animated, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { authAPI, notificationsAPI } from './src/services/api';
import { colors } from './src/theme';
import { registerExpoPushToken, deregisterPushToken } from './src/services/NotificationService';
import LoginScreen from './src/screens/LoginScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import FeedScreen from './src/screens/FeedScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import SearchScreen from './src/screens/SearchScreen';
import BookDetailScreen from './src/screens/BookDetailScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import GroupsScreen from './src/screens/GroupsScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';

export const PreloadContext = createContext(null);

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ─── Library Stack ────────────────────────────────────────────────────────────
function LibraryStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="LibraryMain"
        component={LibraryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BookDetail"
        component={BookDetailScreen}
        options={{ title: 'Book Details' }}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ title: 'Search Books' }}
      />
    </Stack.Navigator>
  );
}

// ─── Home Stack ───────────────────────────────────────────────────────────────
function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeMain"
        component={FeedScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ title: 'User Profile' }}
      />
      <Stack.Screen
        name="BookDetail"
        component={BookDetailScreen}
        options={{ title: 'Book Details' }}
      />
    </Stack.Navigator>
  );
}

// ─── Groups Stack ─────────────────────────────────────────────────────────────
function GroupsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="GroupsMain"
        component={GroupsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GroupDetail"
        component={GroupDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// ─── Profile Stack (Profile + Settings) ───────────────────────────────────────
function ProfileStack({ onLogout }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProfileMain" options={{ headerShown: false }}>
        {(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen
        name="Settings"
        options={{ title: 'Settings', headerBackTitle: 'Back' }}
      >
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

// ─── Main Tabs ────────────────────────────────────────────────────────────────
function MainTabs({ onLogout, unreadCount }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: colors.surfaceContainerLowest,
          borderTopWidth: 1,
          borderTopColor: colors.outlineVariant + '60',
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Library"
        component={LibraryStack}
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'library' : 'library-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsStack}
        options={{
          tabBarLabel: 'Circles',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Updates',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.secondary, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      >
        {(props) => <ProfileStack {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [isLoggedIn, setIsLoggedIn]       = useState(false);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [slideIndex, setSlideIndex]       = useState(0);
  const [preloadedFeed, setPreloadedFeed] = useState(null);
  const [preloadedData, setPreloadedData] = useState({ library: null, profile: null, feed: null });
  const fadeAnim = useState(new Animated.Value(1))[0];

  // ── FIX: Auth token stored in a ref so retry useEffect always has the
  //    latest value without racing against AsyncStorage writes.
  const authTokenRef               = useRef(null);
  const registrationInProgressRef  = useRef(false);

  const slides = [
    { icon: '📚', text: 'Track your reading journey' },
    { icon: '✍️', text: 'Journal your thoughts & notes' },
    { icon: '👥', text: 'Connect with fellow readers' },
    { icon: '❤️', text: 'Share your reading moments' },
  ];

  // ── Safe push registration ─────────────────────────────────────────────────
  // Always reads from authTokenRef (never calls authAPI.getToken() again),
  // and blocks concurrent calls with registrationInProgressRef.
  const safePushRegistration = async (label = '') => {
    if (registrationInProgressRef.current) {
      console.log(`[App][${label}] Push registration already in progress — skipping`);
      return;
    }
    const token = authTokenRef.current;
    if (!token) {
      console.warn(`[App][${label}] No auth token in ref — skipping push registration`);
      return;
    }
    registrationInProgressRef.current = true;
    console.log(`[App][${label}] Triggering push registration`);
    try {
      await registerExpoPushToken(token);
    } catch (err) {
      console.warn(`[App][${label}] Push registration error:`, err);
    } finally {
      registrationInProgressRef.current = false;
    }
  };

  // ── App start ─────────────────────────────────────────────────────────────
  useEffect(() => {
    checkLoginStatus();
  }, []);

  // ── Slide carousel animation ───────────────────────────────────────────────
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setSlideIndex((prev) => (prev + 1) % slides.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 1200);
    return () => clearInterval(interval);
  }, [loading]);

  // ── 20s connection timeout ─────────────────────────────────────────────────
  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => {
      if (loading) {
        setError('Connection timeout. Please check your internet and try again.');
        setLoading(false);
      }
    }, 20000);
    return () => clearTimeout(timeout);
  }, [loading]);

  // ── Notification badge polling (60s) ──────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    const poll = async () => {
      try {
        const data = await notificationsAPI.getUnreadCount();
        setUnreadCount(data?.count ?? 0);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  // ── Post-login push retries ────────────────────────────────────────────────
  // FIX: authTokenRef is populated before setIsLoggedIn(true) in both login
  // paths, so these retries are guaranteed to find a valid token.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;

    const retry1 = setTimeout(() => {
      if (!cancelled) safePushRegistration('retry@3s');
    }, 3000);

    const retry2 = setTimeout(() => {
      if (!cancelled) safePushRegistration('retry@10s');
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(retry1);
      clearTimeout(retry2);
    };
  }, [isLoggedIn]);

  // ── Initial auth check + data preload ─────────────────────────────────────
  const checkLoginStatus = async () => {
    const startTime = Date.now();
    try {
      const loggedIn = await authAPI.isLoggedIn();

      if (loggedIn) {
        // Store token in ref BEFORE registration or any state change
        const token = await authAPI.getToken();
        authTokenRef.current = token;
        console.log('[App] Startup: auth token present:', !!token);

        safePushRegistration('startup');

        const headers = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };

        const BASE = 'https://book-tracker-stitch.onrender.com';
        const [library, profile, feed] = await Promise.all([
          fetch(`${BASE}/userbooks/`, { headers }).then((res) => res.json()).catch(() => null),
          fetch(`${BASE}/profile/me`, { headers }).then((res) => res.json()).catch(() => null),
          fetch(`${BASE}/notes/feed?limit=50`, { headers }).then((res) => res.json()).catch(() => null),
        ]);

        setPreloadedData({ library, profile, feed });

        // Prime the notification badge
        fetch(`${BASE}/notifications/unread-count`, { headers })
          .then(r => r.json()).then(d => setUnreadCount(d?.count ?? 0)).catch(() => {});
      } else {
        const feedData = await fetch(
          'https://book-tracker-stitch.onrender.com/notes/feed?limit=10'
        ).then((res) => res.json()).catch(() => []);
        setPreloadedFeed(feedData);
      }

      // Minimum 4.8s splash (4 slides × 1.2s each)
      const remaining = Math.max(0, 4800 - (Date.now() - startTime));
      setTimeout(() => {
        setIsLoggedIn(loggedIn);
        setLoading(false);
      }, remaining);

    } catch (err) {
      console.error('[App] Auth check failed:', err);
      setError('Unable to connect. Please check your internet connection.');
      setLoading(false);
    }
  };

  // ── Fresh login ────────────────────────────────────────────────────────────
  // FIX: Token stored in ref FIRST, then setIsLoggedIn(true).
  // Old code flipped isLoggedIn before the token was ready, so the retry
  // useEffect fired with authTokenRef still null → silent registration miss.
  const handleLoginSuccess = async () => {
    const token = await authAPI.getToken();
    authTokenRef.current = token;
    console.log('[App] handleLoginSuccess: auth token present:', !!token);

    setIsLoggedIn(true); // safe — ref is populated before retries can fire

    safePushRegistration('login');
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    const token = authTokenRef.current || (await authAPI.getToken());
    if (token) deregisterPushToken(token).catch(() => {});
    authTokenRef.current = null;
    await authAPI.logout();
    setIsLoggedIn(false);
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setSlideIndex(0);
    setPreloadedFeed(null);
    setPreloadedData({ library: null, profile: null, feed: null });
    checkLoginStatus();
  };

  // ── Error screen ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Connection Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Splash screen ──────────────────────────────────────────────────────────
  if (loading) {
    const currentSlide = slides[slideIndex];
    return (
      <View style={styles.splashContainer}>
        <View style={styles.splashContent}>
          <Text style={styles.splashLogo}>📚</Text>
          <Text style={styles.splashTitle}>TrackMyRead</Text>
          <Animated.View style={[styles.featureSlide, { opacity: fadeAnim }]}>
            <Text style={styles.featureIcon}>{currentSlide.icon}</Text>
            <Text style={styles.featureText}>{currentSlide.text}</Text>
          </Animated.View>
          <View style={styles.indicators}>
            {slides.map((_, index) => (
              <View
                key={index}
                style={[styles.indicator, index === slideIndex && styles.indicatorActive]}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <NavigationContainer>
      <View style={styles.container}>
        {isLoggedIn ? (
          <PreloadContext.Provider value={preloadedData}>
            <MainTabs onLogout={handleLogout} unreadCount={unreadCount} />
          </PreloadContext.Provider>
        ) : (
          <LoginScreen onLoginSuccess={handleLoginSuccess} preloadedFeed={preloadedFeed} />
        )}
        <StatusBar style="auto" />
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  splashLogo: {
    fontSize: 80,
    marginBottom: 16,
  },
  splashTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 60,
  },
  featureSlide: {
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  featureIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  featureText: {
    fontSize: 18,
    color: '#0066cc',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  indicators: {
    flexDirection: 'row',
    marginTop: 40,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d0d0d0',
    marginHorizontal: 4,
  },
  indicatorActive: {
    backgroundColor: '#0066cc',
    width: 24,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  retryButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
