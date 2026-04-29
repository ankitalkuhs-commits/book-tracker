import React from 'react';
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

// ── Tab stacks ────────────────────────────────────────────────────────────────

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
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
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

// ── Profile stack (pushed from root, accessed via avatar) ─────────────────────

function ProfileStack({ onLogout }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileRoot">{(props) => <ProfileScreen {...props} onLogout={onLogout} />}</Stack.Screen>
      <Stack.Screen name="Settings">{(props) => <SettingsScreen {...props} onLogout={onLogout} />}</Stack.Screen>
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
    </Stack.Navigator>
  );
}

// ── 4-tab navigator ───────────────────────────────────────────────────────────

function TabsNavigator() {
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
            HomeTab: focused ? 'home'      : 'home-outline',
            LibTab:  focused ? 'library'   : 'library-outline',
            CircTab: focused ? 'people'    : 'people-outline',
            InsTab:  focused ? 'bar-chart' : 'bar-chart-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" options={{ title: 'Home' }}     component={FeedStack} />
      <Tab.Screen name="LibTab"  options={{ title: 'Library' }}  component={LibraryStack} />
      <Tab.Screen name="CircTab" options={{ title: 'Circles' }}  component={GroupsStack} />
      <Tab.Screen name="InsTab"  options={{ title: 'Insights' }} component={InsightsStack} />
    </Tab.Navigator>
  );
}

// ── Root navigator — tabs + Notifications + Profile as pushed screens ─────────

export default function AppNavigator({ onLogout }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabsNavigator} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile">{(props) => <ProfileStack {...props} onLogout={onLogout} />}</Stack.Screen>
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
    </Stack.Navigator>
  );
}
