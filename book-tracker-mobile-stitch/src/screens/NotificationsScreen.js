import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { notificationsAPI } from '../services/api';
import { colors, radius, shadow, type } from '../theme';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const EVENT_CONFIG = {
  new_follower:            { icon: 'person-add',       color: colors.primaryContainer,  bgColor: colors.primaryContainer + '22', navTarget: 'user' },
  follow:                  { icon: 'person-add',       color: colors.primaryContainer,  bgColor: colors.primaryContainer + '22', navTarget: 'user' },
  post_liked:              { icon: 'heart',            color: colors.error,             bgColor: colors.errorContainer,          navTarget: 'feed' },
  like:                    { icon: 'heart',            color: colors.error,             bgColor: colors.errorContainer,          navTarget: 'feed' },
  post_commented:          { icon: 'chatbubble',       color: colors.error,             bgColor: colors.errorContainer,          navTarget: 'feed' },
  comment:                 { icon: 'chatbubble',       color: colors.error,             bgColor: colors.errorContainer,          navTarget: 'feed' },
  book_added:              { icon: 'book',             color: colors.tertiary,          bgColor: colors.tertiaryContainer + '44', navTarget: 'feed' },
  book_completed:          { icon: 'checkmark-circle', color: colors.onSecondaryContainer, bgColor: colors.secondaryContainer,   navTarget: 'feed' },
  book_finished:           { icon: 'checkmark-circle', color: colors.onSecondaryContainer, bgColor: colors.secondaryContainer,   navTarget: 'feed' },
  reading_streak_reminder: { icon: 'flame',            color: colors.onSecondaryContainer, bgColor: colors.secondaryContainer,   navTarget: 'insights' },
  group_invite:            { icon: 'people',           color: colors.primaryContainer,  bgColor: colors.primaryContainer + '22', navTarget: 'group' },
  group_join_request:      { icon: 'person-add',       color: colors.primaryContainer,  bgColor: colors.primaryContainer + '22', navTarget: 'group' },
  milestone:               { icon: 'flag',             color: colors.onSecondaryContainer, bgColor: colors.secondaryContainer,   navTarget: null },
  default:                 { icon: 'notifications',    color: colors.onSurfaceVariant,  bgColor: colors.surfaceContainerHigh,    navTarget: null },
};

function NotifIcon({ eventType }) {
  const cfg = EVENT_CONFIG[eventType] || EVENT_CONFIG.default;
  return (
    <View style={[styles.iconWrap, { backgroundColor: cfg.bgColor }]}>
      <Ionicons name={cfg.icon} size={20} color={cfg.color} />
    </View>
  );
}

function NotifRow({ item, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.row, !item.is_read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <NotifIcon eventType={item.event_type} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.rowBodyText} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.rowTime}>{timeAgo(item.sent_at)}</Text>
      </View>
      {!item.is_read && <View style={styles.unreadDot} />}
      <Ionicons name="chevron-forward" size={14} color={colors.outlineVariant} />
    </TouchableOpacity>
  );
}

export default function NotificationsScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [notifs,      setNotifs]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await notificationsAPI.getHistory();
      setNotifs(Array.isArray(data) ? data : []);
    } catch { setNotifs([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Auto-refresh whenever tab comes into focus
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleMarkAllRead = async () => {
    setMarkingRead(true);
    try {
      await notificationsAPI.markAllRead();
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* ignore */ }
    setMarkingRead(false);
  };

  const handleNotifPress = (item) => {
    // Mark this one as read optimistically
    setNotifs(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));

    const cfg = EVENT_CONFIG[item.event_type] || EVENT_CONFIG.default;
    const data = item.data || {};
    const actorId = item.actor_id || data.actor_id;

    switch (cfg.navTarget) {
      case 'user':
        if (actorId) navigation?.navigate('UserProfile', { userId: actorId });
        break;
      case 'feed':
        // Navigate to Home tab — book/post events show in the feed
        navigation?.navigate('Tabs', { screen: 'HomeTab' });
        break;
      case 'insights':
        navigation?.navigate('Tabs', { screen: 'InsTab' });
        break;
      case 'group':
        if (data.group_id) {
          navigation?.navigate('Tabs', {
            screen: 'CircTab',
            params: { screen: 'GroupDetail', params: { groupId: data.group_id } },
          });
        } else {
          navigation?.navigate('Tabs', { screen: 'CircTab' });
        }
        break;
      default:
        break;
    }
  };

  const unreadCount = notifs.filter(n => !n.is_read).length;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <View style={{ height: insets.top, backgroundColor: colors.surface }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>{t('notifications.eyebrow')}</Text>
          <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} disabled={markingRead} style={styles.markBtn}>
            <Text style={styles.markBtnText}>{markingRead ? t('notifications.markingAllRead') : t('notifications.markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>
            {t('notifications.unreadCount', { count: unreadCount })}
          </Text>
        </View>
      )}

      {notifs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={56} color={colors.outlineVariant} />
          <Text style={styles.emptyTitle}>{t('notifications.allCaughtUp')}</Text>
          <Text style={styles.emptySub}>{t('notifications.newActivityWillShowUp')}</Text>
        </View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <NotifRow item={item} onPress={() => handleNotifPress(item)} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.surface },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: colors.surface },
  backBtn:     { marginRight: 12, padding: 4 },
  headerLabel: { ...type.eyebrow, color: colors.secondary, marginBottom: 2 },
  headerTitle: { ...type.headline, color: colors.onSurfaceVariant },
  markBtn:     { backgroundColor: colors.surfaceContainerHigh, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  markBtnText: { ...type.label, color: colors.primary },

  unreadBanner:     { backgroundColor: colors.primary + '12', paddingHorizontal: 20, paddingVertical: 8 },
  unreadBannerText: { ...type.label, color: colors.primary },

  list:        { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 24 },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, gap: 12, ...shadow.card },
  rowUnread:   { backgroundColor: colors.primary + '08', borderLeftWidth: 3, borderLeftColor: colors.primary },
  iconWrap:    { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowBody:     { flex: 1, gap: 2 },
  rowTitle:    { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface },
  rowBodyText: { ...type.bodySm, color: colors.onSurfaceVariant },
  rowTime:     { ...type.caption, color: colors.outline, marginTop: 2 },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, flexShrink: 0 },
  sep:         { height: 8 },

  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 60 },
  emptyTitle:  { ...type.titleLg, color: colors.onSurface, marginTop: 8 },
  emptySub:    { ...type.body, color: colors.onSurfaceVariant },
});
