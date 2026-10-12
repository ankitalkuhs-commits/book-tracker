import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import BookPreviewScreen from '../screens/BookPreviewScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ── Tab stacks ────────────────────────────────────────────────────────────────

function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="BookPreview" component={BookPreviewScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
    </Stack.Navigator>
  );
}

function LibraryStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Library" component={LibraryScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
      <Stack.Screen name="BookPreview" component={BookPreviewScreen} />
    </Stack.Navigator>
  );
}

function GroupsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Groups" component={GroupsScreen} />
      <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="BookPreview" component={BookPreviewScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
    </Stack.Navigator>
  );
}

function InsightsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Insights" component={InsightsScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
      <Stack.Screen name="BookPreview" component={BookPreviewScreen} />
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
      <Stack.Screen name="BookPreview" component={BookPreviewScreen} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
    </Stack.Navigator>
  );
}

// ── 4-tab navigator ───────────────────────────────────────────────────────────

function TabsNavigator() {
  const { t } = useTranslation();
  // The tab bar is the ONE place in this app that was not inset-aware (25 other call sites of
  // useSafeAreaInsets across 10 files were). `edgeToEdgeEnabled: true` in app.json means the
  // window extends under the system bars, and giving `tabBarStyle` an explicit `height` opts
  // out of React Navigation's own `49 + insets.bottom` - so the bar was laid out against the
  // raw screen bottom and sat inside the inset on every device that has one.
  //
  // Measured on an Android tablet at the iPad's 834x1194dp: the labels rendered at y 2417-2465
  // of a 2508px screen whose app frame ended at 2388, i.e. entirely under the system taskbar,
  // and they tracked the screen bottom rather than the app frame when the display was resized.
  //
  // Where there is no bottom inset this is arithmetically identical to what shipped (60 + 0,
  // 8 + 0), so it cannot move the tab bar on a device that was already correct.
  const insets = useSafeAreaInsets();
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
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
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
      <Tab.Screen name="HomeTab" options={{ title: t('tabs.feed') }}     component={FeedStack} />
      <Tab.Screen name="LibTab"  options={{ title: t('tabs.library') }}  component={LibraryStack} />
      <Tab.Screen name="CircTab" options={{ title: t('tabs.circles') }}  component={GroupsStack} />
      <Tab.Screen name="InsTab"  options={{ title: t('tabs.insights') }} component={InsightsStack} />
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
