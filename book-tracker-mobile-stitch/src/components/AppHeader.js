import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, type } from '../theme';
import { NotificationContext } from '../context/NotificationContext';

/**
 * Shared top header — TrackMyRead logo | bell (with unread badge) | avatar
 *
 * Props:
 *  - user: { name, email } — used to derive avatar initials
 *  - onBellPress: () => void — navigate to Notifications
 *  - onAvatarPress: () => void — navigate to Profile
 */
export default function AppHeader({ user, onBellPress, onAvatarPress }) {
  const insets = useSafeAreaInsets();
  const { unreadCount } = useContext(NotificationContext);

  const initials = React.useMemo(() => {
    const name = user?.name || user?.email || '';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';
  }, [user]);

  const badgeCount = unreadCount > 0 ? (unreadCount > 9 ? '9+' : String(unreadCount)) : null;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surfaceContainerLowest} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.logo}>TrackMyRead</Text>

        <View style={styles.actions}>
          {/* Bell */}
          <TouchableOpacity onPress={onBellPress} activeOpacity={0.7} style={styles.iconBtn}>
            <Ionicons name="notifications-outline" size={24} color={colors.onSurface} />
            {badgeCount && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Avatar */}
          <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.8}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '40',
    // stronger shadow for the scroll-behind fade effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 10,
  },
  logo: {
    ...type.titleLg,
    color: colors.primary,
    letterSpacing: -0.3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#e53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 9,
    fontWeight: '800',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...type.label,
    color: colors.onPrimary,
  },
});
