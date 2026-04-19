import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  Alert, StatusBar, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupsAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ name, size = 40 }) {
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const ACTIVITY_ICON = {
  member_joined:      { name: 'person-add-outline',  color: colors.primary },
  book_started:       { name: 'book-outline',        color: colors.tertiary },
  book_finished:      { name: 'checkmark-circle-outline', color: colors.primary },
  milestone_reached:  { name: 'flag-outline',        color: colors.secondary },
  note_posted:        { name: 'pencil-outline',      color: colors.primary },
  group_book_changed: { name: 'library-outline',     color: colors.primary },
};

function activityText(ev) {
  const name = ev.user?.name || 'Someone';
  const p = ev.payload ? (typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload) : {};
  switch (ev.event_type) {
    case 'member_joined':      return `${name} joined the circle`;
    case 'book_started':       return `${name} started reading ${p.book_title || 'a book'}`;
    case 'book_finished':      return `${name} finished ${p.book_title || 'a book'} 🎉`;
    case 'milestone_reached':  return `${name} is ${p.pct}% through ${p.book_title || 'a book'}`;
    case 'note_posted':        return `${name} shared a note${p.book_title ? ` on ${p.book_title}` : ''}`;
    case 'group_book_changed': return `${name} set the group book to ${p.book_title || 'a new book'}`;
    default:                   return `${name} did something`;
  }
}

function ActivityRow({ event }) {
  const cfg = ACTIVITY_ICON[event.event_type] || { name: 'ellipse-outline', color: colors.outline };
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: cfg.color + '18' }]}>
        <Ionicons name={cfg.name} size={16} color={cfg.color} />
      </View>
      <View style={styles.activityBody}>
        <Text style={styles.activityText}>{activityText(event)}</Text>
        <Text style={styles.activityTime}>{timeAgo(event.created_at)}</Text>
      </View>
    </View>
  );
}

function PostCard({ post, onDelete, isOwn, isCurator }) {
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <Avatar name={post.user?.name} size={36} />
        <View style={styles.postMeta}>
          <Text style={styles.postAuthor}>{post.user?.name || 'Member'}</Text>
          <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
        </View>
        {(isOwn || isCurator) && (
          <TouchableOpacity onPress={() => onDelete(post.id)} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.postText}>{post.text}</Text>
      {post.quote ? (
        <View style={styles.postQuote}>
          <Text style={styles.postQuoteText}>"{post.quote}"</Text>
        </View>
      ) : null}
    </View>
  );
}

function MemberRow({ member }) {
  const isCurator = member.role === 'curator';
  return (
    <View style={styles.memberRow}>
      <Avatar name={member.name} size={40} />
      <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
      {isCurator && (
        <View style={styles.curatorBadge}>
          <Text style={styles.curatorBadgeText}>Curator</Text>
        </View>
      )}
    </View>
  );
}

export default function GroupDetailScreen({ route, navigation }) {
  const { groupId } = route.params;

  const [group, setGroup] = useState(null);
  const [posts, setPosts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [members, setMembers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Post composer
  const [showComposer, setShowComposer] = useState(false);
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);

  // Pagination
  const [visiblePosts, setVisiblePosts] = useState(8);
  const [visibleActivity, setVisibleActivity] = useState(8);

  const safe = fn => fn.catch(() => null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [g, p, act, m, lb] = await Promise.all([
        safe(groupsAPI.getGroup(groupId)),
        safe(groupsAPI.getGroupPosts(groupId)),
        safe(groupsAPI.getGroupActivity(groupId)),
        safe(groupsAPI.getGroupMembers(groupId)),
        safe(groupsAPI.getLeaderboard(groupId)),
      ]);
      if (g) setGroup(g);
      setPosts(Array.isArray(p) ? p : []);
      setActivity(Array.isArray(act) ? act : []);
      setMembers(Array.isArray(m) ? m : []);
      setLeaderboard(Array.isArray(lb) ? lb : []);
    } catch (e) {
      Alert.alert('Error', 'Could not load group');
      navigation.goBack();
    }
    setLoading(false);
    setRefreshing(false);
  }, [groupId]);

  useEffect(() => { load(); }, []);

  const handleCreatePost = async () => {
    if (!postText.trim()) return;
    setPosting(true);
    try {
      const post = await groupsAPI.createGroupPost(groupId, { text: postText.trim() });
      setPosts(prev => [post, ...prev]);
      setPostText('');
      setShowComposer(false);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not post');
    }
    setPosting(false);
  };

  const handleDeletePost = (postId) => {
    Alert.alert('Delete post', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await groupsAPI.deleteGroupPost(groupId, postId);
            setPosts(prev => prev.filter(p => p.id !== postId));
          } catch {}
        },
      },
    ]);
  };

  const handleLeave = () => {
    Alert.alert('Leave circle', `Leave ${group?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          try {
            await groupsAPI.leaveGroup(groupId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.detail || 'Could not leave');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isMember = group?.membership_status === 'active';
  const isCurator = group?.membership_role === 'curator';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{group?.name}</Text>
          <Text style={styles.headerSub}>{group?.member_count ?? members.length} members</Text>
        </View>
        {isMember && !isCurator && (
          <TouchableOpacity onPress={handleLeave} style={styles.leaveBtn}>
            <Text style={styles.leaveBtnText}>Leave</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        {/* Description */}
        {group?.description ? (
          <Text style={styles.description}>{group.description}</Text>
        ) : null}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LEADERBOARD</Text>
            <Text style={styles.sectionTitle}>Top Readers</Text>
            {leaderboard.slice(0, 5).map((entry, i) => (
              <View key={entry.user_id} style={styles.leaderRow}>
                <Text style={styles.leaderRank}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </Text>
                <Avatar name={entry.name} size={32} />
                <Text style={styles.leaderName} numberOfLines={1}>{entry.name}</Text>
                <Text style={styles.leaderPages}>{entry.pages_read ?? 0}p</Text>
              </View>
            ))}
          </View>
        )}

        {/* Activity feed */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIVITY</Text>
          <Text style={styles.sectionTitle}>What's Happening</Text>
          {activity.length === 0 ? (
            <Text style={styles.emptyMsg}>No activity yet — start reading!</Text>
          ) : (
            <>
              {activity.slice(0, visibleActivity).map(ev => (
                <ActivityRow key={ev.id} event={ev} />
              ))}
              {activity.length > visibleActivity && (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setVisibleActivity(v => v + 8)}>
                  <Text style={styles.loadMoreText}>Load more ({activity.length - visibleActivity} remaining)</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Posts */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>DISCUSSION</Text>
              <Text style={styles.sectionTitle}>Group Posts</Text>
            </View>
            {isMember && (
              <TouchableOpacity style={styles.postBtn} onPress={() => setShowComposer(true)}>
                <Ionicons name="add" size={18} color={colors.onPrimary} />
                <Text style={styles.postBtnText}>Post</Text>
              </TouchableOpacity>
            )}
          </View>
          {posts.length === 0 ? (
            <Text style={styles.emptyMsg}>No posts yet — be the first to share!</Text>
          ) : (
            <>
              {posts.slice(0, visiblePosts).map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  isOwn={false}
                  isCurator={isCurator}
                  onDelete={handleDeletePost}
                />
              ))}
              {posts.length > visiblePosts && (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setVisiblePosts(v => v + 8)}>
                  <Text style={styles.loadMoreText}>Load more ({posts.length - visiblePosts} remaining)</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MEMBERS</Text>
          <Text style={styles.sectionTitle}>Circle Members</Text>
          {members.map(m => <MemberRow key={m.user_id} member={m} />)}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Post composer modal */}
      <Modal visible={showComposer} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowComposer(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.composerContainer}>
            <View style={styles.composerHeader}>
              <TouchableOpacity onPress={() => { setShowComposer(false); setPostText(''); }}>
                <Text style={styles.composerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.composerTitle}>New Post</Text>
              <TouchableOpacity
                onPress={handleCreatePost}
                disabled={posting || !postText.trim()}
              >
                <Text style={[styles.composerPost, (!postText.trim() || posting) && styles.composerPostDisabled]}>
                  {posting ? 'Posting…' : 'Post'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.composerInput}
              value={postText}
              onChangeText={setPostText}
              placeholder="Share a thought with the circle…"
              placeholderTextColor={colors.outline}
              multiline
              autoFocus
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '40',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  leaveBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: radius.full, backgroundColor: colors.error + '15',
  },
  leaveBtnText: { fontSize: 13, fontWeight: '600', color: colors.error },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  description: { fontSize: 14, color: colors.onSurfaceVariant, lineHeight: 20, marginBottom: 16 },
  section: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg, padding: 16, marginBottom: 14, ...shadow.card,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    color: colors.secondary, marginBottom: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.primary, marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  emptyMsg: { fontSize: 13, color: colors.outline, fontStyle: 'italic' },
  // Leaderboard
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  leaderRank: { fontSize: 18, width: 28, textAlign: 'center' },
  leaderName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.onSurface },
  leaderPages: { fontSize: 13, fontWeight: '700', color: colors.primary },
  // Activity
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  activityIcon: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityBody: { flex: 1 },
  activityText: { fontSize: 13, color: colors.onSurface, lineHeight: 18 },
  activityTime: { fontSize: 11, color: colors.outline, marginTop: 2 },
  // Posts
  postCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 14, marginBottom: 10,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  postMeta: { flex: 1 },
  postAuthor: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  postTime: { fontSize: 11, color: colors.outline, marginTop: 1 },
  postText: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  postQuote: {
    marginTop: 8, borderLeftWidth: 3, borderLeftColor: colors.primary,
    paddingLeft: 10, paddingVertical: 4,
  },
  postQuoteText: { fontSize: 13, fontStyle: 'italic', color: colors.onSurfaceVariant },
  deleteBtn: { padding: 4 },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: radius.md,
  },
  postBtnText: { fontSize: 13, fontWeight: '700', color: colors.onPrimary },
  // Members
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  memberName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.onSurface },
  curatorBadge: {
    backgroundColor: colors.primary + '18',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
  },
  curatorBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  avatar: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: colors.onPrimary, fontWeight: '800' },
  // Load more
  loadMoreBtn: {
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant + '40',
    borderRadius: radius.md, marginTop: 4,
  },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  // Composer
  composerContainer: { flex: 1, backgroundColor: colors.surfaceContainerLowest },
  composerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '40',
  },
  composerCancel: { fontSize: 16, color: colors.onSurfaceVariant },
  composerTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface },
  composerPost: { fontSize: 16, fontWeight: '700', color: colors.primary },
  composerPostDisabled: { color: colors.outlineVariant },
  composerInput: {
    flex: 1, padding: 20, fontSize: 16,
    color: colors.onSurface, textAlignVertical: 'top',
  },
});
