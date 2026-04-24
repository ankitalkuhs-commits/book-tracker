import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Image, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userAPI, userbooksAPI, activityAPI, notesAPI } from '../services/api';
import { colors, radius, shadow, type } from '../theme';

const SCREEN_W   = Dimensions.get('window').width;
const BOOK_TILE_W = (SCREEN_W - 32 - 16) / 3;

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function fmt(n) {
  if (!n && n !== 0) return '—';
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
}

// ── Velocity / activity chart ─────────────────────────────────────────────────
function VelocityChart({ data, period, onPeriodChange }) {
  if (!data || data.length === 0) return null;
  const max  = Math.max(...data.map(d => d.pages_read || 0), 1);
  const barW = Math.max(3, Math.floor((SCREEN_W - 80) / data.length) - 1);
  return (
    <View style={styles.velocityCard}>
      <View style={styles.velocityHeader}>
        <View>
          <Text style={styles.velocityTitle}>Reading Velocity</Text>
          <Text style={styles.velocitySub}>Activity tracked over the last {period} days</Text>
        </View>
        <View style={styles.periodToggle}>
          {['30', '90'].map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => onPeriodChange(p)}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>{p}D</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: 72, marginTop: 12 }}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round(((d.pages_read || 0) / max) * 68));
          const isToday = i === data.length - 1;
          return (
            <View key={i} style={{
              width: barW, height: h,
              backgroundColor: (d.pages_read || 0) > 0
                ? (isToday ? colors.secondary : colors.primary)
                : colors.surfaceContainerHigh,
              borderRadius: 2,
            }} />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={styles.axisLabel}>{period} DAYS AGO</Text>
        <Text style={styles.axisLabel}>TODAY</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const [user,         setUser]         = useState(null);
  const [stats,        setStats]        = useState(null);
  const [books,        setBooks]        = useState([]);
  const [notes,        setNotes]        = useState([]);
  const [activity,     setActivity]     = useState([]);
  const [period,       setPeriod]       = useState('30');
  const [following,    setFollowing]    = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showAllBooks,  setShowAllBooks]  = useState(false);
  const likingInFlight = useRef(new Set());

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
      if (u.status   === 'fulfilled') { setUser(u.value); setFollowing(u.value?.is_following ?? false); }
      if (s.status   === 'fulfilled') setStats(s.value);
      if (b.status   === 'fulfilled') setBooks(Array.isArray(b.value) ? b.value : []);
      if (n.status   === 'fulfilled') setNotes(Array.isArray(n.value) ? n.value.slice(0, 20) : []);
      if (act.status === 'fulfilled') setActivity(act.value || []);
    } catch { /* allSettled handles per-request */ }
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    activityAPI.getUserActivity(userId, parseInt(p)).then(d => setActivity(d || [])).catch(() => {});
  };

  const toggleFollow = async () => {
    setFollowLoading(true);
    try {
      if (following) { await userAPI.unfollowUser(userId); setFollowing(false); }
      else           { await userAPI.followUser(userId);   setFollowing(true);  }
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not update follow'); }
    setFollowLoading(false);
  };

  const handleLike = async (noteId, isLiked) => {
    if (likingInFlight.current.has(noteId)) return;
    likingInFlight.current.add(noteId);
    setNotes(prev => prev.map(n => n.id === noteId
      ? { ...n, user_has_liked: !isLiked, likes_count: isLiked ? (n.likes_count || 1) - 1 : (n.likes_count || 0) + 1 }
      : n
    ));
    try {
      if (isLiked) await notesAPI.unlikePost(noteId);
      else         await notesAPI.likePost(noteId);
    } catch {
      setNotes(prev => prev.map(n => n.id === noteId
        ? { ...n, user_has_liked: isLiked, likes_count: isLiked ? (n.likes_count || 0) + 1 : (n.likes_count || 1) - 1 }
        : n
      ));
    } finally { likingInFlight.current.delete(noteId); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const name             = user?.name || user?.email?.split('@')[0] || 'Reader';
  const isPrivate        = user?.is_private_profile && !following;
  const currentlyReading = books.filter(b => b.status === 'reading');
  const finished         = books.filter(b => b.status === 'finished');
  const displayedBooks   = showAllBooks ? books : books.slice(0, 6);

  // Progress ring data
  const goalTarget   = stats?.yearly_goal ?? 0;
  const goalFinished = stats?.finished_books ?? finished.length;
  const goalPct      = goalTarget > 0 ? Math.min(100, Math.round((goalFinished / goalTarget) * 100)) : 0;
  const avgPpd       = stats?.avg_pages_per_day ?? null;
  const totalPages   = stats?.total_pages_read   ?? 0;
  const currentYear  = new Date().getFullYear();

  const goToProfile = (uid) => {
    if (uid && uid !== userId) navigation.push('UserProfile', { userId: uid });
  };

  return (
    <View style={styles.container}>
      {/* Back bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true, parseInt(period))} tintColor={colors.primary} />}
      >
        {/* ── Hero ── */}
        <View style={styles.heroSection}>
          {user?.profile_picture ? (
            <Image source={{ uri: user.profile_picture }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>{getInitials(name)}</Text>
            </View>
          )}
          <Text style={styles.userName}>{name}</Text>
          {user?.username && <Text style={styles.heroUsername}>@{user.username}</Text>}
          {user?.bio && <Text style={styles.userBio}>{user.bio}</Text>}

          {/* Stats pills */}
          <View style={styles.statsPills}>
            <TouchableOpacity style={styles.statPill}>
              <Text style={styles.statPillValue}>{user?.followers_count ?? 0}</Text>
              <Text style={styles.statPillLabel}>FOLLOWERS</Text>
            </TouchableOpacity>
            <View style={styles.statPillDivider} />
            <TouchableOpacity style={styles.statPill}>
              <Text style={styles.statPillValue}>{user?.following_count ?? 0}</Text>
              <Text style={styles.statPillLabel}>FOLLOWING</Text>
            </TouchableOpacity>
            <View style={styles.statPillDivider} />
            <TouchableOpacity style={styles.statPill}>
              <Text style={styles.statPillValue}>{books.length}</Text>
              <Text style={styles.statPillLabel}>COLLECTIONS</Text>
            </TouchableOpacity>
          </View>

          {/* Follow button */}
          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={toggleFollow}
            disabled={followLoading}
          >
            {followLoading
              ? <ActivityIndicator size="small" color={following ? colors.primary : colors.onPrimary} />
              : <>
                  {following && <Ionicons name="checkmark" size={14} color={colors.primary} style={{ marginRight: 4 }} />}
                  <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                    {following ? 'Following' : user?.follows_you ? 'Follow Back' : 'Follow'}
                  </Text>
                </>
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
            {/* ── Yearly Progress ── */}
            {goalTarget > 0 && (
              <View style={styles.progressSection}>
                <Text style={styles.progressEyebrow}>{currentYear} PROGRESS</Text>
                <View style={styles.progressBody}>
                  <Text style={styles.progressNum}>{goalFinished}</Text>
                  <Text style={styles.progressOf}> / {goalTarget} books</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${goalPct}%` }]} />
                </View>
                {totalPages > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <Ionicons name="document-text-outline" size={13} color={colors.onSurfaceVariant} />
                    <Text style={styles.progressPages}>{fmt(totalPages)} pages read</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Velocity chart ── */}
            {activity.length > 0 && (
              <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
                <VelocityChart data={activity} period={period} onPeriodChange={handlePeriodChange} />
              </View>
            )}

            {/* ── Curated Library ── */}
            {books.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Curated Library</Text>
                  <TouchableOpacity onPress={() => setShowAllBooks(p => !p)}>
                    <Text style={styles.viewAllLink}>
                      {showAllBooks ? 'Show less' : `View All ${books.length} Books →`}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.bookGrid}>
                  {displayedBooks.map(ub => (
                    <View key={ub.id} style={styles.bookTile}>
                      {ub.book?.cover_url ? (
                        <Image source={{ uri: ub.book.cover_url }} style={styles.bookCover} />
                      ) : (
                        <View style={[styles.bookCover, styles.bookCoverFallback]}>
                          <Ionicons name="book-outline" size={22} color={colors.outline} />
                        </View>
                      )}
                      <Text style={styles.bookTileTitle} numberOfLines={2}>{ub.book?.title || 'Unknown'}</Text>
                      <Text style={styles.bookTileAuthor} numberOfLines={1}>{ub.book?.author || ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── By The Numbers ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>By The Numbers</Text>
              <View style={styles.numbersGrid}>
                <View style={styles.numberCard}>
                  <Text style={styles.numberValue}>{books.length}</Text>
                  <Text style={styles.numberLabel}>In Library</Text>
                </View>
                <View style={styles.numberCard}>
                  <Text style={styles.numberValue}>{finished.length}</Text>
                  <Text style={styles.numberLabel}>Finished</Text>
                </View>
                <View style={styles.numberCard}>
                  <Text style={styles.numberValue}>{avgPpd ? Math.round(avgPpd) : '—'}</Text>
                  <Text style={styles.numberLabel}>Avg pages/day</Text>
                </View>
              </View>

              {/* Currently Reading */}
              {currentlyReading.length > 0 && (
                <View style={styles.currentlyReadingBlock}>
                  <Text style={styles.currentlyReadingLabel}>CURRENTLY READING</Text>
                  {currentlyReading.slice(0, 3).map(ub => {
                    const total = ub.book?.total_pages || 0;
                    const pct   = total > 0 ? Math.min(100, Math.round(((ub.current_page || 0) / total) * 100)) : 0;
                    return (
                      <View key={ub.id} style={styles.currentlyReadingRow}>
                        {ub.book?.cover_url ? (
                          <Image source={{ uri: ub.book.cover_url }} style={styles.currentlyCover} />
                        ) : (
                          <View style={[styles.currentlyCover, styles.bookCoverFallback]}>
                            <Ionicons name="book-outline" size={14} color={colors.outline} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.currentlyTitle} numberOfLines={1}>{ub.book?.title || 'Unknown'}</Text>
                          <Text style={styles.currentlyAuthor} numberOfLines={1}>{ub.book?.author || ''}</Text>
                          {total > 0 && (
                            <View style={styles.currentlyProgress}>
                              <View style={styles.currentlyTrack}>
                                <View style={[styles.currentlyFill, { width: `${pct}%` }]} />
                              </View>
                              <Text style={styles.currentlyPct}>{pct}%</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {currentlyReading.length > 3 && (
                    <Text style={styles.currentlyMore}>+{currentlyReading.length - 3} more</Text>
                  )}
                </View>
              )}
            </View>

            {/* ── Public Notes ── */}
            {notes.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Public Notes</Text>
                <View style={{ gap: 10 }}>
                  {notes.map(note => (
                    <View key={note.id} style={styles.noteCard}>
                      <View style={styles.noteHeader}>
                        {note.book?.title && (
                          <Text style={styles.noteBookTag} numberOfLines={1}>{note.book.title}</Text>
                        )}
                        <TouchableOpacity style={styles.shareBtn}>
                          <Ionicons name="share-outline" size={16} color={colors.outline} />
                        </TouchableOpacity>
                      </View>
                      {note.quote && (
                        <View style={styles.quoteBlock}>
                          <Text style={styles.quoteText} numberOfLines={4}>"{note.quote}"</Text>
                        </View>
                      )}
                      {note.text && (
                        <Text style={styles.noteText} numberOfLines={6}>{note.text}</Text>
                      )}
                      <View style={styles.noteFooter}>
                        <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
                        <View style={styles.noteActions}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface },
  backBtn:     { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, ...type.title, color: colors.onSurface, textAlign: 'center', marginHorizontal: 8 },

  heroSection:    { alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 },
  avatarImg:      { width: 96, height: 96, borderRadius: 14, borderWidth: 3, borderColor: colors.primary, marginBottom: 14 },
  avatarFallback: { width: 96, height: 96, borderRadius: 14, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 3, borderColor: colors.primary },
  avatarText:     { fontFamily: 'NotoSerif_700Bold', fontSize: 34, fontWeight: '700', color: colors.primary },
  userName:       { ...type.titleLg, color: colors.onSurface, marginBottom: 2 },
  heroUsername:   { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 6 },
  userBio:        { fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20, marginBottom: 14, paddingHorizontal: 16 },

  statsPills:      { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  statPill:        { alignItems: 'center', paddingHorizontal: 16 },
  statPillValue:   { fontFamily: 'NotoSerif_700Bold', fontSize: 18, fontWeight: '700', color: colors.onSurface },
  statPillLabel:   { ...type.eyebrow, color: colors.onSurfaceVariant, marginTop: 2 },
  statPillDivider: { width: 1, height: 28, backgroundColor: colors.outlineVariant + '60' },

  followBtn:           { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 28, paddingVertical: 10, minWidth: 120, justifyContent: 'center' },
  followBtnActive:     { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  followBtnText:       { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },
  followBtnTextActive: { color: colors.primary },

  lockedCard:  { margin: 24, padding: 32, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, alignItems: 'center', gap: 10, ...shadow.card },
  lockedTitle: { ...type.titleLg, color: colors.onSurface },
  lockedSub:   { fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },

  // Yearly Progress
  progressSection: { marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 18, ...shadow.card },
  progressEyebrow: { ...type.eyebrow, color: colors.secondary, marginBottom: 6 },
  progressBody:    { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  progressNum:     { fontFamily: 'NotoSerif_700Bold', fontSize: 42, fontWeight: '700', color: colors.onSurface, lineHeight: 48 },
  progressOf:      { fontSize: 16, color: colors.onSurfaceVariant },
  progressTrack:   { height: 10, backgroundColor: colors.surfaceContainerHigh, borderRadius: 5, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: colors.secondary, borderRadius: 5 },
  progressPages:   { fontSize: 13, color: colors.onSurfaceVariant },

  // Velocity
  velocityCard:    { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 16, ...shadow.card },
  velocityHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  velocityTitle:   { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface },
  velocitySub:     { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },
  periodToggle:    { flexDirection: 'row', backgroundColor: colors.surfaceContainerHigh, borderRadius: 999, padding: 2, gap: 2 },
  periodBtn:       { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  periodBtnActive: { backgroundColor: colors.primary },
  periodBtnText:   { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant },
  periodBtnTextActive: { color: colors.onPrimary },
  axisLabel:       { fontSize: 9, fontWeight: '600', letterSpacing: 0.8, color: colors.outline },

  section:         { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeaderRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:    { ...type.titleLg, color: colors.onSurface },
  viewAllLink:     { fontSize: 13, color: colors.primary, fontWeight: '600' },

  bookGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bookTile:        { width: BOOK_TILE_W },
  bookCover:       { width: BOOK_TILE_W, height: BOOK_TILE_W * 1.5, borderRadius: radius.md, marginBottom: 4 },
  bookCoverFallback: { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' },
  bookTileTitle:   { fontSize: 11, fontWeight: '700', color: colors.onSurface, lineHeight: 15 },
  bookTileAuthor:  { fontSize: 10, color: colors.onSurfaceVariant },

  // By The Numbers
  numbersGrid:     { flexDirection: 'row', gap: 10, marginBottom: 16 },
  numberCard:      { flex: 1, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, alignItems: 'flex-start', ...shadow.card },
  numberValue:     { fontFamily: 'NotoSerif_700Bold', fontSize: 26, fontWeight: '700', color: colors.primary, lineHeight: 30 },
  numberLabel:     { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },

  currentlyReadingBlock: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, ...shadow.card },
  currentlyReadingLabel: { ...type.eyebrow, color: colors.secondary, marginBottom: 12 },
  currentlyReadingRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  currentlyCover:        { width: 44, height: 64, borderRadius: radius.sm },
  currentlyTitle:        { fontSize: 13, fontWeight: '700', color: colors.onSurface, marginBottom: 2 },
  currentlyAuthor:       { fontSize: 11, color: colors.onSurfaceVariant, marginBottom: 6 },
  currentlyProgress:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currentlyTrack:        { flex: 1, height: 4, backgroundColor: colors.surfaceContainerHigh, borderRadius: 2, overflow: 'hidden' },
  currentlyFill:         { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  currentlyPct:          { fontSize: 10, fontWeight: '700', color: colors.primary, width: 28 },
  currentlyMore:         { fontSize: 12, color: colors.outline, marginTop: 4, fontStyle: 'italic' },

  // Notes
  noteCard:        { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.md, padding: 16, ...shadow.card },
  noteHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  noteBookTag:     { fontSize: 12, fontWeight: '700', color: colors.primary, flex: 1, marginRight: 8 },
  shareBtn:        { padding: 2 },
  quoteBlock:      { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 10, marginBottom: 8 },
  quoteText:       { ...type.bodySm, fontFamily: 'NotoSerif_400Italic', fontStyle: 'italic', color: colors.onSurfaceVariant },
  noteText:        { ...type.body, color: colors.onSurface, marginBottom: 10 },
  noteFooter:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh },
  noteDate:        { fontSize: 11, color: colors.outline, fontWeight: '600' },
  noteActions:     { flexDirection: 'row', gap: 14 },
  noteAction:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteActionCount: { fontSize: 12, color: colors.onSurfaceVariant },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: colors.onSurfaceVariant },
});
