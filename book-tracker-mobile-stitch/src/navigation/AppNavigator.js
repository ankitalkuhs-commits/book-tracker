import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// Screens
import FeedScreen from '../screens/FeedScreen';
import LibraryScreen from '../screens/LibraryScreen';
import GroupsScreen from '../screens/GroupsScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import InsightsScreen from '../screens/InsightsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import BookDetailScreen from '../screens/BookDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ── Stack navigators ─────────────────────────────────────────────────────────

function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
    </Stack.Navigator>
  );
}

function LibraryStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Library" component={LibraryScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
    </Stack.Navigator>
  );
}

function GroupsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Groups" component={GroupsScreen} />
      <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
    </Stack.Navigator>
  );
}

function InsightsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Insights" component={InsightsScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack({ onLogout }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile">{(props) => <ProfileScreen {...props} onLogout={onLogout} />}</Stack.Screen>
      <Stack.Screen name="Settings">{(props) => <SettingsScreen {...props} onLogout={onLogout} />}</Stack.Screen>
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
    </Stack.Navigator>
  );
}

// ── Badge helper ─────────────────────────────────────────────────────────────

function TabBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <View style={badge.wrap}>
      <Text style={badge.text}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    position: 'absolute', top: -4, right: -8,
    backgroundColor: '#e53935', borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  text: { color: '#fff', fontSize: 10, fontWeight: '700' },
});

// ── Root tab navigator ────────────────────────────────────────────────────────

export default function AppNavigator({ unreadCount = 0, onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.outlineVariant + '60',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            HomeTab: focused ? 'home'          : 'home-outline',
            LibTab:  focused ? 'library'       : 'library-outline',
            CircTab: focused ? 'people'        : 'people-outline',
            InsTab:  focused ? 'bar-chart'     : 'bar-chart-outline',
            NotiTab: focused ? 'notifications' : 'notifications-outline',
            ProfTab: focused ? 'person'        : 'person-outline',
          };
          const name = icons[route.name] || 'ellipse';
          if (route.name === 'NotiTab') {
            return (
              <View>
                <Ionicons name={name} size={size} color={color} />
                <TabBadge count={unreadCount} />
              </View>
            );
          }
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" options={{ title: 'Home' }}     component={FeedStack} />
      <Tab.Screen name="LibTab"  options={{ title: 'Library' }}  component={LibraryStack} />
      <Tab.Screen name="CircTab" options={{ title: 'Circles' }}  component={GroupsStack} />
      <Tab.Screen name="InsTab"  options={{ title: 'Insights' }} component={InsightsStack} />
      <Tab.Screen name="NotiTab" options={{ title: 'Updates' }}>
        {(props) => <NotificationsScreen {...props} />}
      </Tab.Screen>
      <Tab.Screen name="ProfTab" options={{ title: 'Profile' }}>
        {(props) => <ProfileStack {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
