import React, { useState, useEffect, createContext } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text, Animated, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from './src/services/api';
import { handleAppOpen } from './src/services/NotificationService';
import LoginScreen from './src/screens/LoginScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import FeedScreen from './src/screens/FeedScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import SearchScreen from './src/screens/SearchScreen';
import BookDetailScreen from './src/screens/BookDetailScreen';

// Create context for preloaded data
export const PreloadContext = createContext(null);

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Library Stack (Library + Detail + Search)
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

// Home Stack (for future comment/detail screens)
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

// Main App Tabs
function MainTabs({ onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0066cc',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeStack}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? 'home' : 'home-outline'} 
              size={size} 
              color={focused ? color : '#666'} 
            />
          ),
        }}
      />
      <Tab.Screen 
        name="Library" 
        component={LibraryStack}
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? 'library' : 'library-outline'} 
              size={size} 
              color={focused ? color : '#666'} 
            />
          ),
        }}
      />
      <Tab.Screen 
        name="Profile"
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? 'person' : 'person-outline'} 
              size={size} 
              color={focused ? color : '#666'} 
            />
          ),
        }}
      >
        {(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [preloadedFeed, setPreloadedFeed] = useState(null);
  const [preloadedData, setPreloadedData] = useState({ library: null, profile: null, feed: null });
  const fadeAnim = useState(new Animated.Value(1))[0];

  const slides = [
    { icon: '📚', text: 'Track your reading journey' },
    { icon: '✍️', text: 'Journal your thoughts & notes' },
    { icon: '👥', text: 'Connect with fellow readers' },
    { icon: '❤️', text: 'Share your reading moments' },
  ];

  // Check if user is logged in on app start
  useEffect(() => {
    checkLoginStatus();
  }, []);

  // Auto-advance slides during loading (keeps cycling even if auth takes long)
  useEffect(() => {
    if (!loading) return;

    const interval = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Change slide
        setSlideIndex((prev) => (prev + 1) % slides.length);
        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 1200); // Change slide every 1.2 seconds - keeps cycling indefinitely

    return () => clearInterval(interval);
  }, [loading]);

  // Timeout handler - if loading takes more than 20 seconds, show error
  useEffect(() => {
    if (!loading) return;

    const timeout = setTimeout(() => {
      if (loading) {
        setError('Connection timeout. Please check your internet and try again.');
        setLoading(false);
      }
    }, 20000); // 20 second timeout

    return () => clearTimeout(timeout);
  }, [loading]);

  const checkLoginStatus = async () => {
    const startTime = Date.now();
    
    try {
      // First check auth status
      const loggedIn = await authAPI.isLoggedIn();
      
      if (loggedIn) {
        // Trigger notification logic - cancel today's nudge since user opened the app
        handleAppOpen().catch(err => console.warn('Notification error:', err));

        // User is logged in - preload library, profile, and logged-in feed
        const token = await authAPI.getToken();
        const headers = { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        
        const [library, profile, feed] = await Promise.all([
          fetch('https://book-tracker-backend-0hiz.onrender.com/userbooks/', { headers })
            .then(res => res.json())
            .catch(() => null),
          fetch('https://book-tracker-backend-0hiz.onrender.com/profile/me', { headers })
            .then(res => res.json())
            .catch(() => null),
          fetch('https://book-tracker-backend-0hiz.onrender.com/notes/feed?limit=50', { headers })
            .then(res => res.json())
            .catch(() => null)
        ]);
        
        setPreloadedData({ library, profile, feed });
      } else {
        // User not logged in - preload public feed only
        const feedData = await fetch('https://book-tracker-backend-0hiz.onrender.com/notes/feed?limit=10')
          .then(res => res.json())
          .catch(() => []);
        
        setPreloadedFeed(feedData);
      }
      
      // Ensure minimum splash time of 4.8 seconds to show all 4 slides (4 × 1.2s)
      const elapsedTime = Date.now() - startTime;
      const minDisplayTime = 4800; // 4.8 seconds - guarantees full cycle through all slides
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);
      
      setTimeout(() => {
        setIsLoggedIn(loggedIn);
        setLoading(false);
      }, remainingTime);
      
    } catch (err) {
      // Immediate network error - no point showing carousel
      console.error('Auth check failed:', err);
      setError('Unable to connect. Please check your internet connection.');
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setSlideIndex(0);
    setPreloadedFeed(null);
    setPreloadedData({ library: null, profile: null, feed: null });
    checkLoginStatus();
  };

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    // User just logged in - cancel nudge for today, schedule for 9PM if not yet passed
    handleAppOpen().catch(err => console.warn('Notification error:', err));
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  // Error state - show error with retry option
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

  // Loading state - show onboarding carousel (cycles indefinitely until auth completes or times out)

  if (loading) {
    const currentSlide = slides[slideIndex];
    
    return (
      <View style={styles.splashContainer}>
        <View style={styles.splashContent}>
          <Text style={styles.splashLogo}>📚</Text>
          <Text style={styles.splashTitle}>TrackMyRead</Text>
          
          {/* Animated Feature Slide */}
          <Animated.View style={[styles.featureSlide, { opacity: fadeAnim }]}>
            <Text style={styles.featureIcon}>{currentSlide.icon}</Text>
            <Text style={styles.featureText}>{currentSlide.text}</Text>
          </Animated.View>
          
          {/* Slide Indicators */}
          <View style={styles.indicators}>
            {slides.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.indicator,
                  index === slideIndex && styles.indicatorActive,
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <View style={styles.container}>
        {isLoggedIn ? (
          <PreloadContext.Provider value={preloadedData}>
            <MainTabs onLogout={handleLogout} />
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
