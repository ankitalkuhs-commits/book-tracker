import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, StatusBar, Modal,
  KeyboardAvoidingView, Platform, Image, FlatList, Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupsAPI, booksAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ name, size = 40 }) {
  const ini = name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{ini}</Text>
    </View>
  );
}

const ACTIVITY_ICON = {
  member_joined:      { name: 'person-add-outline',      color: colors.primary },
  book_started:       { name: 'book-outline',            color: colors.tertiary },
  book_finished:      { name: 'checkmark-circle-outline',color: colors.primary },
  milestone_reached:  { name: 'flag-outline',            color: colors.secondary },
  note_posted:        { name: 'pencil-outline',          color: colors.primary },
  group_book_changed: { name: 'library-outline',         color: colors.primary },
};

function activityText(ev) {
  const name = ev.user?.name || 'Someone';
  const p    = ev.payload ? (typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload) : {};
  switch (ev.event_type) {
    case 'member_joined':      return `${name} joined the circle`;
    case 'book_started':       return `${name} started reading ${p.book_title || 'a book'}`;
    case 'book_finished':      return `${name} finished ${p.book_title || 'a book'} 🎉`;
    case 'milestone_reached':  return `${name} is ${p.pct}% through ${p.book_title || 'a book'}`;
    case 'note_posted':        return `${name} shared a note${p.book_title ? ` on ${p.book_title}` : ''}`;
    case 'group_book_changed': return `Group book changed to ${p.book_title || 'a new book'}`;
    default:                   return `${name} did something`;
  }
}

// ── Set Group Book Modal ──────────────────────────────────────────────────────
function SetGroupBookModal({ visible, onClose, onSet }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [setting,   setSetting]   = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await booksAPI.search(query.trim());
      setResults(r || []);
    } catch { /* ignore */ }
    setSearching(false);
  };

  const pick = async (book) => {
    setSetting(true);
    try {
      await onSet(book);
      setQuery(''); setResults([]);
      onClose();
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not set book'); }
    setSetting(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>Set Group Book</Text>
          <View style={{ width: 56 }} />
        </View>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a book…"
            placeholderTextColor={colors.outline}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={searching}>
            {searching
              ? <ActivityIndicator size="small" color={colors.onPrimary} />
              : <Ionicons name="search" size={20} color={colors.onPrimary} />
            }
          </TouchableOpacity>
        </View>
        {setting && <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />}
        <FlatList
          data={results}
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.bookResultRow} onPress={() => pick(item)} activeOpacity={0.8}>
              {item.cover_url ? (
                <Image source={{ uri: item.cover_url }} style={styles.bookResultCover} />
              ) : (
                <View style={[styles.bookResultCover, { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="book-outline" size={20} color={colors.outline} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.bookResultTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.bookResultAuthor} numberOfLines={1}>{item.authors?.join(', ') || 'Unknown'}</Text>
              </View>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function GroupDetailScreen({ route, navigation }) {
  const { groupId } = route.params;
  const insets = useSafeAreaInsets();
  const [group,       setGroup]       = useState(null);
  const [posts,       setPosts]       = useState([]);
  const [activity,    setActivity]    = useState([]);
  const [members,     setMembers]     = useState([]);
  const [pending,     setPending]     = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbPeriod,    setLbPeriod]    = useState('monthly');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [showComposer,     setShowComposer]     = useState(false);
  const [showSetBookModal, setShowSetBookModal] = useState(false);
  const [postText,    setPostText]    = useState(false);
  const [posting,     setPosting]     = useState(false);
  const [postInput,   setPostInput]   = useState('');

  const safe = fn => Promise.resolve(fn).catch(() => null);

  const load = useCallback(async (isRefresh = false, period = lbPeriod) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [g, p, act, m, lb, pend] = await Promise.all([
        safe(groupsAPI.getGroup(groupId)),
        safe(groupsAPI.getGroupPosts(groupId)),
        safe(groupsAPI.getGroupActivity(groupId)),
        safe(groupsAPI.getGroupMembers(groupId)),
        safe(groupsAPI.getLeaderboard(groupId, period)),
        safe(groupsAPI.getPendingMembers(groupId).catch(() => [])),
      ]);
      if (g) setGroup(g);
      setPosts(Array.isArray(p) ? p : []);
      setActivity(Array.isArray(act) ? act : []);
      setMembers(Array.isArray(m) ? m : []);
      setLeaderboard(Array.isArray(lb) ? lb : []);
      setPending(Array.isArray(pend) ? pend : []);
    } catch {
      Alert.alert('Error', 'Could not load group');
      navigation.goBack();
    }
    setLoading(false);
    setRefreshing(false);
  }, [groupId]);

  useEffect(() => { load(); }, []);

  const loadLeaderboard = async (period) => {
    try {
      const lb = await groupsAPI.getLeaderboard(groupId, period);
      setLeaderboard(Array.isArray(lb) ? lb : []);
    } catch { /* ignore */ }
  };

  const handleLbPeriod = (p) => {
    setLbPeriod(p);
    loadLeaderboard(p);
  };

  const handleCreatePost = async () => {
    if (!postInput.trim()) return;
    setPosting(true);
    try {
      const post = await groupsAPI.createGroupPost(groupId, { text: postInput.trim() });
      setPosts(prev => [post, ...prev]);
      setPostInput('');
      setShowComposer(false);
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not post'); }
    setPosting(false);
  };

  const handleDeletePost = (postId) => Alert.alert('Delete post', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await groupsAPI.deleteGroupPost(groupId, postId); setPosts(prev => prev.filter(p => p.id !== postId)); }
      catch { Alert.alert('Error', 'Could not delete post'); }
    }},
  ]);

  const handleApprove = async (userId) => {
    try { await groupsAPI.approveGroupMember(groupId, userId); setPending(prev => prev.filter(m => m.user_id !== userId)); load(); }
    catch { Alert.alert('Error', 'Could not approve member'); }
  };

  const handleReject = async (userId) => {
    try { await groupsAPI.rejectGroupMember(groupId, userId); setPending(prev => prev.filter(m => m.user_id !== userId)); }
    catch { Alert.alert('Error', 'Could not reject member'); }
  };

  const handleRemoveMember = (member) => Alert.alert(`Remove ${member.name}?`, 'They will be removed from the circle.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      try { await groupsAPI.removeGroupMember(groupId, member.user_id); setMembers(prev => prev.filter(m => m.user_id !== member.user_id)); }
      catch { Alert.alert('Error', 'Could not remove member'); }
    }},
  ]);

  const handleLeave = () => Alert.alert('Leave circle', `Leave ${group?.name}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: async () => {
      try { await groupsAPI.leaveGroup(groupId); navigation.goBack(); }
      catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not leave'); }
    }},
  ]);

  const handleSetGroupBook = async (book) => {
    await groupsAPI.setGroupBook(groupId, book);
    const updated = await groupsAPI.getGroup(groupId);
    setGroup(updated);
  };

  const handleClearGroupBook = () => Alert.alert('Clear group book?', 'Remove the current reading selection?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      try { await groupsAPI.clearGroupBook(groupId); setGroup(prev => ({ ...prev, current_book: null })); }
      catch { Alert.alert('Error', 'Could not clear book'); }
    }},
  ]);

  const handleDisband = () => Alert.alert('Disband Group', `Permanently delete "${group?.name}"? This cannot be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Disband', style: 'destructive', onPress: async () => {
      try { await groupsAPI.deleteGroup(groupId); navigation.goBack(); }
      catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not disband group'); }
    }},
  ]);

  const handleCopyInviteLink = () => {
    const link = group?.invite_code ? `/join/${group.invite_code}` : '';
    if (link) {
      Clipboard.setString(`https://tracker-stitch.vercel.app${link}`);
      Alert.alert('Copied!', 'Invite link copied to clipboard');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const isMember  = group?.membership_status === 'active';
  const isCurator = group?.membership_role === 'curator';
  const groupBook = group?.current_book;

  const memberCount = group?.member_count ?? members.length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View style={{ height: insets.top, backgroundColor: colors.primary }} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.onPrimary} />}
      >
        {/* ── Hero card ── */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.onPrimary} />
          </TouchableOpacity>
          <Text style={styles.heroEyebrow}>{group?.is_private ? 'PRIVATE LITERARY CIRCLE' : 'PUBLIC LITERARY CIRCLE'}</Text>
          <Text style={styles.heroTitle}>{group?.name}</Text>
          {group?.description ? <Text style={styles.heroDesc}>{group.description}</Text> : null}
          <View style={styles.heroPills}>
            <View style={styles.heroPill}>
              <Ionicons name="people-outline" size={12} color={colors.onPrimary} />
              <Text style={styles.heroPillText}>{memberCount} MEMBERS</Text>
            </View>
            {group?.is_private && (
              <View style={styles.heroPill}>
                <Ionicons name="lock-closed-outline" size={12} color={colors.onPrimary} />
                <Text style={styles.heroPillText}>PRIVATE</Text>
              </View>
            )}
            {isCurator && (
              <View style={styles.heroPill}>
                <Ionicons name="star-outline" size={12} color={colors.secondary} />
                <Text style={[styles.heroPillText, { color: colors.secondaryContainer }]}>CURATOR</Text>
              </View>
            )}
          </View>
          {isMember && !isCurator && (
            <TouchableOpacity onPress={handleLeave} style={styles.leaveBtn}>
              <Text style={styles.leaveBtnText}>Leave Circle</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Pending members (curator only) ── */}
        {isCurator && pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CURATOR</Text>
            <Text style={styles.sectionTitle}>Pending Requests ({pending.length})</Text>
            {pending.map(m => (
              <View key={m.user_id} style={styles.pendingRow}>
                <Avatar name={m.name} size={36} />
                <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(m.user_id)}>
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(m.user_id)}>
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── Leaderboard ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>RANKINGS</Text>
              <Text style={styles.sectionTitle}>Leaderboard</Text>
            </View>
            <View style={styles.periodToggle}>
              {[['monthly', 'This Month'], ['alltime', 'All Time']].map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.periodBtn, lbPeriod === val && styles.periodBtnActive]}
                  onPress={() => handleLbPeriod(val)}
                >
                  <Text style={[styles.periodBtnText, lbPeriod === val && styles.periodBtnTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {leaderboard.length === 0 ? (
            <Text style={styles.emptyMsg}>No data yet — start reading together!</Text>
          ) : leaderboard.slice(0, 5).map((entry, i) => (
            <TouchableOpacity key={entry.user_id} style={styles.leaderRow} onPress={() => navigation.navigate('UserProfile', { userId: entry.user_id })}>
              <Text style={styles.leaderRank}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</Text>
              <Avatar name={entry.name} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.leaderName} numberOfLines={1}>{entry.name}</Text>
                {entry.currently_reading && <Text style={styles.leaderReading} numberOfLines={1}>Reading: {entry.currently_reading}</Text>}
                {entry.books_finished > 0 && <Text style={styles.leaderReading}>{entry.books_finished} books finished</Text>}
              </View>
              <Text style={styles.leaderPages}>{entry.pages_read ?? 0} pages</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Activity ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WHAT'S HAPPENING</Text>
          <Text style={styles.sectionTitle}>Member Activity</Text>
          {activity.length === 0 ? (
            <Text style={styles.emptyMsg}>No activity yet — start reading!</Text>
          ) : (
            activity.slice(0, 10).map(ev => (
              <View key={ev.id} style={styles.activityRow}>
                {(() => { const cfg = ACTIVITY_ICON[ev.event_type] || { name: 'ellipse-outline', color: colors.outline };
                  return (
                    <View style={[styles.activityIcon, { backgroundColor: cfg.color + '18' }]}>
                      <Ionicons name={cfg.name} size={16} color={cfg.color} />
                    </View>
                  );
                })()}
                <View style={styles.activityBody}>
                  <Text style={styles.activityText}>{activityText(ev)}</Text>
                  <Text style={styles.activityTime}>{timeAgo(ev.created_at)}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Discussion ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>DISCUSSIONS</Text>
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
            posts.slice(0, 20).map(post => (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Avatar name={post.user?.name} size={36} />
                  <View style={styles.postMeta}>
                    <Text style={styles.postAuthor}>{post.user?.name || 'Member'}</Text>
                    <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                  </View>
                  {isCurator && (
                    <TouchableOpacity onPress={() => handleDeletePost(post.id)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
                {post.quote && (
                  <View style={styles.postQuote}>
                    <Text style={styles.postQuoteText}>"{post.quote}"</Text>
                  </View>
                )}
                <Text style={styles.postText}>{post.text}</Text>
              </View>
            ))
          )}
        </View>

        {/* ── Members ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MEMBERS</Text>
          <Text style={styles.sectionTitle}>Members {members.length}</Text>
          {members.map(m => (
            <TouchableOpacity key={m.user_id} style={styles.memberRow} onPress={() => navigation.navigate('UserProfile', { userId: m.user_id })}>
              <Avatar name={m.name} size={40} />
              <View style={{ flex: 1 }}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                  {m.role === 'curator' && (
                    <View style={styles.curatorBadge}><Text style={styles.curatorBadgeText}>CURATOR</Text></View>
                  )}
                </View>
                <Text style={styles.memberUsername}>@{m.username || m.name?.toLowerCase().replace(/\s/g, '')}</Text>
              </View>
              {isCurator && m.role !== 'curator' && (
                <TouchableOpacity onPress={() => handleRemoveMember(m)} style={styles.removeBtn}>
                  <Ionicons name="person-remove-outline" size={16} color={colors.outline} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Currently Reading (Group Book) ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>CURRENTLY READING</Text>
              <Text style={styles.sectionTitle}>Group Book</Text>
            </View>
            {isCurator && (
              <TouchableOpacity onPress={() => setShowSetBookModal(true)}>
                <Text style={styles.textLink}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
          {groupBook ? (
            <View style={styles.groupBookRow}>
              {groupBook.cover_url ? (
                <Image source={{ uri: groupBook.cover_url }} style={styles.groupBookCover} />
              ) : (
                <View style={[styles.groupBookCover, { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="book" size={28} color={colors.outline} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.groupBookLabel}>NOW READING</Text>
                <Text style={styles.groupBookTitle}>{groupBook.title}</Text>
                <Text style={styles.groupBookAuthor}>{groupBook.author}</Text>
                {isCurator && (
                  <TouchableOpacity onPress={handleClearGroupBook}>
                    <Text style={styles.removeLink}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.groupBookEmpty}>
              <Ionicons name="book-outline" size={32} color={colors.outlineVariant} />
              <Text style={styles.groupBookEmptyText}>No group book selected</Text>
              {isCurator && (
                <TouchableOpacity onPress={() => setShowSetBookModal(true)}>
                  <Text style={styles.textLink}>Set a book</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ── Reading Goal ── */}
        {group?.reading_goal > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>READING GOAL</Text>
            <Text style={styles.sectionTitle}>Yearly Progress</Text>
            <Text style={styles.goalPages}>{group.pages_read_total ?? 0}</Text>
            <Text style={styles.goalOf}>of {group.reading_goal.toLocaleString()} pages</Text>
            <View style={styles.goalTrack}>
              <View style={[styles.goalFill, { width: `${Math.min(100, Math.round(((group.pages_read_total ?? 0) / group.reading_goal) * 100))}%` }]} />
            </View>
            <Text style={styles.goalPct}>{Math.min(100, Math.round(((group.pages_read_total ?? 0) / group.reading_goal) * 100))}% complete</Text>
          </View>
        )}

        {/* ── Invite Friends ── */}
        {isCurator && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>EXPAND THE CIRCLE</Text>
            <Text style={styles.sectionTitle}>Invite Friends</Text>
            {group?.invite_code ? (
              <View style={styles.inviteLinkRow}>
                <Text style={styles.inviteLinkText} numberOfLines={1}>/join/{group.invite_code}</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyInviteLink}>
                  <Text style={styles.copyBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={15} color={colors.outline} />
              <Text style={styles.searchPlaceholder}>Search by username...</Text>
            </View>
          </View>
        )}

        {/* ── Disband (curator only) ── */}
        {isCurator && (
          <TouchableOpacity style={styles.disbandBtn} onPress={handleDisband}>
            <Text style={styles.disbandText}>Disband Group</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Post composer modal */}
      <Modal visible={showComposer} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowComposer(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.composerRoot}>
            <View style={styles.composerHeader}>
              <TouchableOpacity onPress={() => { setShowComposer(false); setPostInput(''); }}>
                <Text style={styles.composerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.composerTitle}>New Post</Text>
              <TouchableOpacity onPress={handleCreatePost} disabled={posting || !postInput.trim()}>
                <Text style={[styles.composerPost, (!postInput.trim() || posting) && { opacity: 0.4 }]}>
                  {posting ? 'Posting…' : 'Post'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.composerInput}
              value={postInput}
              onChangeText={setPostInput}
              placeholder="Share a thought with the circle…"
              placeholderTextColor={colors.outline}
              multiline
              autoFocus
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SetGroupBookModal
        visible={showSetBookModal}
        onClose={() => setShowSetBookModal(false)}
        onSet={handleSetGroupBook}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '40' },
  backBtn:      { width: 36, height: 36, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  headerSub:    { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  leaveBtn:     { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  leaveBtnText: { fontSize: 13, fontWeight: '600', color: colors.onPrimary },

  // Hero card
  hero:          { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 20, marginBottom: 14, ...shadow.card },
  heroEyebrow:   { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: 'rgba(255,255,255,0.65)', marginBottom: 6 },
  heroTitle:     { fontSize: 26, fontWeight: '900', color: colors.onPrimary, lineHeight: 30, marginBottom: 6 },
  heroDesc:      { fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 20, marginBottom: 12 },
  heroPills:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  heroPillText:  { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.onPrimary },

  scroll:        { paddingHorizontal: 16, paddingTop: 16 },
  description:   { fontSize: 14, color: colors.onSurfaceVariant, lineHeight: 20, marginBottom: 16 },
  section:       { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 16, marginBottom: 14, ...shadow.card },
  sectionLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.secondary, marginBottom: 2 },
  sectionTitle:  { fontSize: 18, fontWeight: '800', color: colors.primary, marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  emptyMsg:      { fontSize: 13, color: colors.outline, fontStyle: 'italic' },

  groupBookRow:      { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surfaceContainerLow, padding: 12, borderRadius: radius.md },
  groupBookCover:    { width: 56, height: 84, borderRadius: radius.sm },
  groupBookLabel:    { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: colors.secondary, marginBottom: 3 },
  groupBookTitle:    { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginBottom: 3 },
  groupBookAuthor:   { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 6 },
  groupBookPages:    { fontSize: 11, color: colors.outline },
  groupBookEmpty:    { alignItems: 'center', paddingVertical: 20, gap: 8 },
  groupBookEmptyText:{ fontSize: 14, color: colors.onSurfaceVariant },
  setBookBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary },
  setBookBtnText:    { fontSize: 13, color: colors.primary, fontWeight: '600' },
  textLink:          { fontSize: 13, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
  removeLink:        { fontSize: 12, color: colors.error, fontWeight: '600' },

  // Reading Goal
  goalPages:    { fontSize: 36, fontWeight: '900', color: colors.primary, lineHeight: 42 },
  goalOf:       { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 10 },
  goalTrack:    { height: 8, backgroundColor: colors.surfaceContainerHigh, borderRadius: 99, overflow: 'hidden', marginBottom: 6 },
  goalFill:     { height: '100%', backgroundColor: colors.primary, borderRadius: 99 },
  goalPct:      { fontSize: 12, color: colors.onSurfaceVariant, fontWeight: '600' },

  // Invite
  inviteLinkRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, gap: 10 },
  inviteLinkText: { flex: 1, fontSize: 13, color: colors.onSurfaceVariant, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBtn:        { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.md },
  copyBtnText:    { fontSize: 12, fontWeight: '700', color: colors.onPrimary },
  searchWrap:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  searchPlaceholder: { fontSize: 13, color: colors.outline },

  // Disband
  disbandBtn:   { marginHorizontal: 16, marginBottom: 8, paddingVertical: 14, alignItems: 'center' },
  disbandText:  { fontSize: 14, fontWeight: '600', color: colors.error },

  pendingRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  approveBtn:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.md, backgroundColor: colors.primary },
  approveBtnText: { fontSize: 12, fontWeight: '700', color: colors.onPrimary },
  rejectBtn:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.md, backgroundColor: colors.error + '15' },
  rejectBtnText: { fontSize: 12, fontWeight: '700', color: colors.error },

  periodToggle:   { flexDirection: 'row', backgroundColor: colors.surfaceContainerHigh, borderRadius: 999, padding: 2, gap: 2 },
  periodBtn:      { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  periodBtnActive:{ backgroundColor: colors.primary },
  periodBtnText:  { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
  periodBtnTextActive: { color: colors.onPrimary },

  leaderRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  leaderRank:     { fontSize: 18, width: 28, textAlign: 'center' },
  leaderName:     { fontSize: 14, fontWeight: '600', color: colors.onSurface, marginBottom: 1 },
  leaderReading:  { fontSize: 11, color: colors.onSurfaceVariant, fontStyle: 'italic' },
  leaderPages:    { fontSize: 13, fontWeight: '700', color: colors.primary },

  activityRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  activityIcon: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityBody: { flex: 1 },
  activityText: { fontSize: 13, color: colors.onSurface, lineHeight: 18 },
  activityTime: { fontSize: 11, color: colors.outline, marginTop: 2 },

  postCard:   { backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  postMeta:   { flex: 1 },
  postAuthor: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  postTime:   { fontSize: 11, color: colors.outline, marginTop: 1 },
  postText:   { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  postQuote:  { marginTop: 8, borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 10, paddingVertical: 4 },
  postQuoteText: { fontSize: 13, fontStyle: 'italic', color: colors.onSurfaceVariant },
  deleteBtn:  { padding: 4 },
  postBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md },
  postBtnText:{ fontSize: 13, fontWeight: '700', color: colors.onPrimary },

  memberRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  memberNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName:     { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  memberUsername: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  curatorBadge:   { backgroundColor: colors.primary + '18', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  curatorBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  removeBtn:      { padding: 4 },

  avatar:     { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: colors.onPrimary, fontWeight: '800' },

  composerRoot:   { flex: 1, backgroundColor: colors.surfaceContainerLowest },
  composerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '40' },
  composerCancel: { fontSize: 16, color: colors.onSurfaceVariant },
  composerTitle:  { fontSize: 17, fontWeight: '700', color: colors.onSurface },
  composerPost:   { fontSize: 16, fontWeight: '700', color: colors.primary },
  composerInput:  { flex: 1, padding: 20, fontSize: 16, color: colors.onSurface, textAlignVertical: 'top' },

  modalRoot:    { flex: 1, backgroundColor: colors.surface },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '60' },
  modalCancel:  { fontSize: 15, color: colors.primary },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: colors.onSurface },
  searchRow:    { flexDirection: 'row', margin: 14, gap: 10 },
  searchInput:  { flex: 1, height: 46, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  searchBtn:    { width: 46, height: 46, backgroundColor: colors.primary, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  bookResultRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
  bookResultCover:{ width: 48, height: 72, borderRadius: radius.sm },
  bookResultTitle:{ fontSize: 14, fontWeight: '700', color: colors.onSurface, lineHeight: 20, marginBottom: 3 },
  bookResultAuthor: { fontSize: 12, color: colors.onSurfaceVariant },
});
