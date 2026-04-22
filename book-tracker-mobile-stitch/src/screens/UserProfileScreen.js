import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, StatusBar, Image, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { userAPI, userbooksAPI, activityAPI, notesAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

const SCREEN_W = Dimensions.get('window').width;

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Velocity chart ─────────────────────────────────────────────────────────────
function VelocityChart({ data, period, onPeriodChange }) {
  if (!data || data.length === 0) return null;
  const max  = Math.max(...data.map(d => d.pages_read || 0), 1);
  const barW = Math.max(3, Math.floor((SCREEN_W - 80) / data.length) - 1);
  return (
    <View style={styles.velocityCard}>
      <View style={styles.velocityHeader}>
        <Text style={styles.velocityTitle}>Reading Velocity</Text>
        <View style={styles.periodToggle}>
          {['30', '90'].map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => onPeriodChange(p)}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: 60, marginTop: 10 }}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round(((d.pages_read || 0) / max) * 56));
          return (
            <View key={i} style={{
              width: barW, height: h,
              backgroundColor: (d.pages_read || 0) > 0 ? colors.primary : colors.surfaceContainerHigh,
              borderRadius: 2,
            }} />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={styles.axisLabel}>{period} days ago</Text>
        <Text style={styles.axisLabel}>Today</Text>
      </View>
    </View>
  );
}

export default function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const [user,       setUser]       = useState(null);
  const [stats,      setStats]      = useState(null);
  const [books,      setBooks]      = useState([]);
  const [notes,      setNotes]      = useState([]);
  const likingInFlight = useRef(new Set());
  const [activity,   setActivity]   = useState([]);
  const [period,     setPeriod]     = useState('30');
  const [following,  setFollowing]  = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showAllBooks, setShowAllBooks]   = useState(false);

  const load = useCallback(async (isRefresh = false, days = 30) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [u, s, b, n, act] = await Promise.allSettled([
        userAPI.getUser(userId),
        userAPI.getUserStats(userId),
        userbooksAPI.getUserBooks(userId),
        userAPI.getUserNotes(userId),
        activityAPI.getUserActivity(userId, days),
      ]);
      if (u.status === 'fulfilled') { setUser(u.value); setFollowing(u.value?.is_following ?? false); }
      if (s.status === 'fulfilled') setStats(s.value);
      if (b.status === 'fulfilled') setBooks(Array.isArray(b.value) ? b.value : []);
      if (n.status === 'fulfilled') setNotes(Array.isArray(n.value) ? n.value.slice(0, 10) : []);
      if (act.status === 'fulfilled') setActivity(act.value || []);
    } catch { /* allSettled handles per-request */ }
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    activityAPI.getUserActivity(userId, parseInt(p)).then(data => setActivity(data || [])).catch(() => {});
  };

  const toggleFollow = async () => {
    setFollowLoading(true);
    try {
      if (following) { await userAPI.unfollowUser(userId); setFollowing(false); }
      else           { await userAPI.followUser(userId);   setFollowing(true); }
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not update follow'); }
    setFollowLoading(false);
  };

  const handleLike = async (noteId, isLiked) => {
    if (likingInFlight.current.has(noteId)) return;
    likingInFlight.current.add(noteId);
    setNotes(prev => prev.map(n => n.id === noteId
      ? { ...n, user_has_liked: !isLiked, likes_count: isLiked ? (n.likes_count||1)-1 : (n.likes_count||0)+1 }
      : n
    ));
    try {
      if (isLiked) await notesAPI.unlikePost(noteId);
      else         await notesAPI.likePost(noteId);
    } catch {
      setNotes(prev => prev.map(n => n.id === noteId
        ? { ...n, user_has_liked: isLiked, likes_count: isLiked ? (n.likes_count||0)+1 : (n.likes_count||1)-1 }
        : n
      ));
    } finally {
      likingInFlight.current.delete(noteId);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const name = user?.name || user?.email?.split('@')[0] || 'Reader';
  const isPrivate = user?.is_private_profile && !following;
  const currentlyReading = books.filter(b => b.status === 'reading');
  const finished         = books.filter(b => b.status === 'finished');
  const displayedBooks   = showAllBooks ? books : books.slice(0, 6);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Back bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true, parseInt(period))} tintColor={colors.primary} />}
      >
        {/* Hero */}
        <View style={styles.heroSection}>
          {user?.profile_picture ? (
            <Image source={{ uri: user.profile_picture }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(name)}</Text>
            </View>
          )}
          <Text style={styles.userName}>{name}</Text>
          {user?.username && <Text style={styles.heroUsername}>@{user.username}</Text>}
          {user?.bio && <Text style={styles.userBio}>{user.bio}</Text>}

          {/* Follower pills */}
          <View style={styles.statsPills}>
            <View style={styles.statPill}>
              <Text style={styles.statPillValue}>{user?.followers_count ?? 0}</Text>
              <Text style={styles.statPillLabel}>Followers</Text>
            </View>
            <View style={styles.statPillDivider} />
            <View style={styles.statPill}>
              <Text style={styles.statPillValue}>{user?.following_count ?? 0}</Text>
              <Text style={styles.statPillLabel}>Following</Text>
            </View>
            <View style={styles.statPillDivider} />
            <View style={styles.statPill}>
              <Text style={styles.statPillValue}>{books.length}</Text>
              <Text style={styles.statPillLabel}>Books</Text>
            </View>
          </View>

          {/* Follow button */}
          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={toggleFollow}
            disabled={followLoading}
          >
            {followLoading
              ? <ActivityIndicator size="small" color={following ? colors.primary : colors.onPrimary} />
              : <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                  {following ? 'Following' : user?.follows_you ? 'Follow Back' : 'Follow'}
                </Text>
            }
          </TouchableOpacity>
        </View>

        {/* Locked profile */}
        {isPrivate ? (
          <View style={styles.lockedCard}>
            <Ionicons name="lock-closed" size={40} color={colors.outlineVariant} />
            <Text style={styles.lockedTitle}>This profile is private</Text>
            <Text style={styles.lockedSub}>Follow {name} to see their library and notes.</Text>
            <TouchableOpacity style={styles.followBtn} onPress={toggleFollow} disabled={followLoading}>
              <Text style={styles.followBtnText}>Follow to unlock</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Reading stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statsItem}>
                <Text style={styles.statsValue}>{books.length}</Text>
                <Text style={styles.statsLabel}>Books</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsValue}>{finished.length}</Text>
                <Text style={styles.statsLabel}>Finished</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsValue}>{currentlyReading.length}</Text>
                <Text style={styles.statsLabel}>Reading</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsValue}>
                  {stats?.total_pages_read
                    ? stats.total_pages_read >= 1000
                      ? (stats.total_pages_read / 1000).toFixed(1) + 'k'
                      : String(stats.total_pages_read)
                    : '0'}
                </Text>
                <Text style={styles.statsLabel}>Pages</Text>
              </View>
            </View>

            {/* Velocity chart */}
            {activity.length > 0 && (
              <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                <VelocityChart data={activity} period={period} onPeriodChange={handlePeriodChange} />
              </View>
            )}

            {/* Library */}
            {books.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Library</Text>
                <View style={styles.bookGrid}>
                  {displayedBooks.map(ub => (
                    <View key={ub.id} style={styles.bookTile}>
                      {ub.book?.cover_url ? (
                        <Image source={{ uri: ub.book.cover_url }} style={styles.bookCover} />
                      ) : (
                        <View style={[styles.bookCover, { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="book-outline" size={22} color={colors.outline} />
                        </View>
                      )}
                      <Text style={styles.bookTileTitle} numberOfLines={2}>{ub.book?.title || 'Unknown'}</Text>
                      <Text style={styles.bookTileAuthor} numberOfLines={1}>{ub.book?.author || ''}</Text>
                    </View>
                  ))}
                </View>
                {books.length > 6 && (
                  <TouchableOpacity style={styles.viewAllBtn} onPress={() => setShowAllBooks(p => !p)}>
                    <Text style={styles.viewAllText}>{showAllBooks ? 'Show less' : `View all ${books.length} books`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Notes */}
            {notes.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Public Notes</Text>
                <View style={{ gap: 10 }}>
                  {notes.map(note => (
                    <View key={note.id} style={styles.noteCard}>
                      {/* Note header */}
                      <View style={styles.noteHeader}>
                        {note.book?.title && (
                          <Text style={styles.noteBookTag} numberOfLines={1}>📖 {note.book.title}</Text>
                        )}
                        <Text style={styles.noteTime}>{timeAgo(note.created_at)}</Text>
                      </View>
                      {note.quote && (
                        <View style={styles.quoteBlock}>
                          <Text style={styles.quoteText} numberOfLines={4}>"{note.quote}"</Text>
                        </View>
                      )}
                      {note.text && (
                        <Text style={styles.noteText} numberOfLines={5}>{note.text}</Text>
                      )}
                      {/* Engagement row */}
                      <View style={styles.noteFooter}>
                        <TouchableOpacity style={styles.noteAction} onPress={() => handleLike(note.id, note.user_has_liked)}>
                          <Ionicons name={note.user_has_liked ? 'heart' : 'heart-outline'} size={15} color={note.user_has_liked ? '#e53935' : colors.onSurfaceVariant} />
                          <Text style={styles.noteActionCount}>{note.likes_count || 0}</Text>
                        </TouchableOpacity>
                        <View style={styles.noteAction}>
                          <Ionicons name="chatbubble-outline" size={15} color={colors.onSurfaceVariant} />
                          <Text style={styles.noteActionCount}>{note.comments_count || 0}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {books.length === 0 && notes.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="book-outline" size={48} color={colors.outlineVariant} />
                <Text style={styles.emptyText}>No reading activity yet</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const BOOK_TILE_W = (SCREEN_W - 32 - 24) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: colors.surface },
  backBtn:     { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.onSurface, textAlign: 'center', marginHorizontal: 8 },

  heroSection:  { alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  avatarImg:    { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: colors.primary, marginBottom: 14 },
  avatar:       { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText:   { fontSize: 36, fontWeight: '800', color: colors.primary },
  userName:     { fontSize: 22, fontWeight: '800', color: colors.onSurface, marginBottom: 2 },
  heroUsername: { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 8 },
  userBio:      { fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20, marginBottom: 14, paddingHorizontal: 16 },

  statsPills:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statPill:       { alignItems: 'center', paddingHorizontal: 16 },
  statPillValue:  { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  statPillLabel:  { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 1 },
  statPillDivider:{ width: 1, height: 24, backgroundColor: colors.outlineVariant + '60' },

  followBtn:         { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 32, paddingVertical: 10, minWidth: 120, alignItems: 'center' },
  followBtnActive:   { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  followBtnText:     { fontSize: 14, fontWeight: '700', color: colors.onPrimary },
  followBtnTextActive: { color: colors.primary },

  lockedCard: { margin: 24, padding: 32, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, alignItems: 'center', gap: 10, ...shadow.card },
  lockedTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface },
  lockedSub:   { fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },

  statsRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, paddingVertical: 16, ...shadow.card },
  statsItem:  { flex: 1, alignItems: 'center' },
  statsValue: { fontSize: 18, fontWeight: '800', color: colors.primary },
  statsLabel: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },
  statsDivider: { width: 1, height: 28, backgroundColor: colors.outlineVariant + '60' },

  velocityCard:   { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, ...shadow.card },
  velocityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  velocityTitle:  { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  periodToggle:   { flexDirection: 'row', backgroundColor: colors.surfaceContainerHigh, borderRadius: 999, padding: 2, gap: 2 },
  periodBtn:      { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  periodBtnActive: { backgroundColor: colors.primary },
  periodBtnText:   { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
  periodBtnTextActive: { color: colors.onPrimary },
  axisLabel:      { fontSize: 10, color: colors.outline },

  section:      { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.onSurfaceVariant, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },

  bookGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bookTile:      { width: BOOK_TILE_W },
  bookCover:     { width: BOOK_TILE_W, height: BOOK_TILE_W * 1.5, borderRadius: radius.md, marginBottom: 4 },
  bookTileTitle: { fontSize: 11, fontWeight: '700', color: colors.onSurface, lineHeight: 15 },
  bookTileAuthor:{ fontSize: 10, color: colors.onSurfaceVariant },
  viewAllBtn:    { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  viewAllText:   { fontSize: 13, color: colors.primary, fontWeight: '600' },

  noteCard:    { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.md, padding: 14, ...shadow.card },
  noteHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  noteBookTag: { fontSize: 11, fontWeight: '600', color: colors.primary, flex: 1, marginRight: 8 },
  noteTime:    { fontSize: 11, color: colors.outline },
  quoteBlock:  { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 10, marginBottom: 8 },
  quoteText:   { fontSize: 13, fontStyle: 'italic', color: colors.onSurfaceVariant, lineHeight: 19 },
  noteText:    { fontSize: 14, color: colors.onSurface, lineHeight: 21, marginBottom: 8 },
  noteFooter:  { flexDirection: 'row', gap: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh },
  noteAction:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteActionCount: { fontSize: 12, color: colors.onSurfaceVariant },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: colors.onSurfaceVariant },
});
