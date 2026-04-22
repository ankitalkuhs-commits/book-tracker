import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Image, Modal, KeyboardAvoidingView,
  Platform, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { userAPI, authAPI, userbooksAPI, notesAPI, activityAPI, profileAPI } from '../services/api';
import { PreloadContext } from '../../App';
import { formatTimeAgo } from '../utils/bookUtils';
import { colors, radius, shadow } from '../theme';

const SCREEN_W = Dimensions.get('window').width;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Activity bar chart ────────────────────────────────────────────────────────
function ActivityChart({ data, streak }) {
  if (!data || data.length === 0) return (
    <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 8 }}>
      No activity data yet. Start logging pages!
    </Text>
  );
  const max = Math.max(...data.map(d => d.pages_read || 0), 1);
  const barW = Math.max(3, Math.floor((SCREEN_W - 64) / data.length) - 1);
  return (
    <View>
      {streak > 0 && (
        <View style={styles.streakBadge}>
          <Text style={styles.streakBadgeText}>🔥 {streak} day streak</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1, marginTop: 12, height: 70 }}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round(((d.pages_read || 0) / max) * 66));
          const isToday = i === data.length - 1;
          return (
            <View key={i} style={{
              width: barW, height: h,
              backgroundColor: (d.pages_read || 0) > 0
                ? (isToday ? colors.onSurface : colors.primary)
                : colors.surfaceContainerHigh,
              borderRadius: 2,
            }} />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={styles.axisLabel}>30 days ago</Text>
        <Text style={styles.axisLabel}>Today</Text>
      </View>
    </View>
  );
}

// ── Circular goal ring ────────────────────────────────────────────────────────
function GoalRing({ pct = 0, size = 72, stroke = 8, color = colors.primary, children }) {
  const r        = size / 2;
  const rightDeg = Math.min(180, (pct / 100) * 360);
  const leftDeg  = Math.max(0, (pct / 100) * 360 - 180);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: r, borderWidth: stroke, borderColor: colors.surfaceContainerHigh }} />
      <View style={{ position: 'absolute', width: size, height: size, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: 0, width: r, height: size, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: -r, width: size, height: size, borderRadius: r, borderWidth: stroke, borderColor: color, transform: [{ rotate: `${rightDeg - 180}deg` }] }} />
        </View>
      </View>
      {leftDeg > 0 && (
        <View style={{ position: 'absolute', width: size, height: size, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, width: r, height: size, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', right: -r, width: size, height: size, borderRadius: r, borderWidth: stroke, borderColor: color, transform: [{ rotate: `${leftDeg - 180}deg` }] }} />
          </View>
        </View>
      )}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}

// ── Note card ─────────────────────────────────────────────────────────────────
function NoteCard({ note, currentUserId, onEdit, onDelete, onLike }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments]         = useState([]);
  const [commentText, setCommentText]   = useState('');
  const [loadingCmts, setLoadingCmts]   = useState(false);
  const isOwn = note.user?.id === currentUserId || note.user_id === currentUserId;

  const loadComments = async () => {
    setLoadingCmts(true);
    try { const c = await notesAPI.getComments(note.id); setComments(c || []); } catch {}
    setLoadingCmts(false);
  };

  const toggleComments = () => {
    if (!showComments) loadComments();
    setShowComments(p => !p);
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    try {
      await notesAPI.addComment(note.id, commentText.trim());
      setCommentText('');
      loadComments();
    } catch { Alert.alert('Error', 'Could not post comment'); }
  };

  return (
    <View style={styles.noteCard}>
      {/* Header */}
      <View style={styles.noteHeader}>
        <View style={{ flex: 1 }}>
          {note.book?.title && (
            <Text style={styles.noteBookTag} numberOfLines={1}>📖 {note.book.title}</Text>
          )}
          <Text style={styles.noteDate}>{formatTimeAgo(note.created_at)}</Text>
        </View>
        {isOwn && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity onPress={() => onEdit(note)} style={styles.noteIconBtn}>
              <Ionicons name="pencil-outline" size={15} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(note)} style={styles.noteIconBtn}>
              <Ionicons name="trash-outline" size={15} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Quote */}
      {note.quote && (
        <View style={styles.quoteBlock}>
          <Text style={styles.quoteText}>"{note.quote}"</Text>
        </View>
      )}

      {/* Body */}
      {note.text && <Text style={styles.noteText}>{note.text}</Text>}

      {/* Footer */}
      <View style={styles.noteFooter}>
        <TouchableOpacity style={styles.noteAction} onPress={() => onLike(note.id, note.user_has_liked)}>
          <Ionicons name={note.user_has_liked ? 'heart' : 'heart-outline'} size={16} color={note.user_has_liked ? '#e53935' : colors.onSurfaceVariant} />
          <Text style={styles.noteActionCount}>{note.likes_count || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.noteAction} onPress={toggleComments}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.onSurfaceVariant} />
          <Text style={styles.noteActionCount}>{note.comments_count || comments.length || 0}</Text>
        </TouchableOpacity>
      </View>

      {/* Comments */}
      {showComments && (
        <View style={styles.commentsSection}>
          {loadingCmts ? <ActivityIndicator size="small" color={colors.primary} /> : (
            comments.map(c => (
              <View key={c.id} style={styles.commentRow}>
                <View style={styles.commentAvatar}>
                  <Text style={styles.commentAvatarText}>{getInitials(c.user?.name)[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.commentName}>{c.user?.name || 'User'}</Text>
                  <Text style={styles.commentText}>{c.text}</Text>
                </View>
              </View>
            ))
          )}
          <View style={styles.commentInput}>
            <TextInput
              style={styles.commentField}
              placeholder="Add a comment…"
              placeholderTextColor={colors.outline}
              value={commentText}
              onChangeText={setCommentText}
              onSubmitEditing={submitComment}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={submitComment} disabled={!commentText.trim()}>
              <Ionicons name="send" size={18} color={commentText.trim() ? colors.primary : colors.outlineVariant} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── New Note Modal ─────────────────────────────────────────────────────────────
function NewNoteModal({ visible, editNote, books, onClose, onSaved }) {
  const [text, setText]   = useState('');
  const [quote, setQuote] = useState('');
  const [ubId, setUbId]   = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editNote) {
      setText(editNote.text || '');
      setQuote(editNote.quote || '');
      setUbId(editNote.userbook_id || null);
    } else {
      setText(''); setQuote(''); setUbId(null);
    }
  }, [editNote, visible]);

  const save = async () => {
    if (!text.trim()) { Alert.alert('Error', 'Please write something'); return; }
    setSaving(true);
    try {
      if (editNote) {
        await notesAPI.updateNote(editNote.id, { text: text.trim(), quote: quote.trim() || null });
      } else {
        await notesAPI.createNote({ text: text.trim(), quote: quote.trim() || null, userbook_id: ubId, is_public: true });
      }
      onSaved();
      onClose();
    } catch { Alert.alert('Error', 'Could not save note'); }
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editNote ? 'Edit Note' : 'New Note'}</Text>
            <TouchableOpacity onPress={save} disabled={saving || !text.trim()}>
              <Text style={[styles.modalSave, (!text.trim() || saving) && { opacity: 0.4 }]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {/* Book picker */}
            {books.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Book (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {[{ id: null, book: { title: 'No book' } }, ...books].map(ub => (
                    <TouchableOpacity
                      key={ub.id ?? 'none'}
                      style={[styles.bookChip, ubId === ub.id && styles.bookChipActive]}
                      onPress={() => setUbId(ub.id)}
                    >
                      <Text style={[styles.bookChipText, ubId === ub.id && styles.bookChipTextActive]} numberOfLines={1}>
                        {ub.book?.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={styles.fieldLabel}>Reflection</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="What are you thinking about your read?"
              placeholderTextColor={colors.outline}
              value={text}
              onChangeText={setText}
              multiline
              autoFocus={!editNote}
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Quote (optional)</Text>
            <TextInput
              style={[styles.noteInput, { height: 72, fontStyle: 'italic' }]}
              placeholder="A quote from the book…"
              placeholderTextColor={colors.outline}
              value={quote}
              onChangeText={setQuote}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Profile Screen ─────────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation, onLogout }) {
  const preloaded = useContext(PreloadContext);
  const [profile,  setProfile]   = useState(preloaded?.profile || null);
  const [books,    setBooks]     = useState(preloaded?.library || []);
  const [notes,    setNotes]     = useState([]);
  const likingInFlight = useRef(new Set());
  const [activity, setActivity]  = useState([]);
  const [insights, setInsights]  = useState(null);
  const [loading,  setLoading]   = useState(!preloaded?.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editNote, setEditNote]  = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [p, b, n, act, ins] = await Promise.allSettled([
        userAPI.getProfile(),
        userbooksAPI.getMyBooks(),
        notesAPI.getMyNotes(),
        activityAPI.getMyActivity(30),
        activityAPI.getInsights(),
      ]);
      if (p.status   === 'fulfilled') setProfile(p.value);
      if (b.status   === 'fulfilled') setBooks(b.value || []);
      if (n.status   === 'fulfilled') setNotes(n.value || []);
      if (act.status === 'fulfilled') setActivity(act.value || []);
      if (ins.status === 'fulfilled') setInsights(ins.value);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    if (!preloaded?.profile) load();
    else { load(); } // still refresh in background
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handlePhotoUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingPhoto(true);
    try {
      const updated = await profileAPI.uploadPicture(result.assets[0].uri);
      setProfile(prev => ({ ...prev, profile_picture: updated.profile_picture }));
    } catch { Alert.alert('Error', 'Could not upload photo'); }
    finally { setUploadingPhoto(false); }
  };

  const handleDeleteNote = (note) => {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await notesAPI.deleteNote(note.id); setNotes(prev => prev.filter(n => n.id !== note.id)); }
        catch { Alert.alert('Error', 'Could not delete note'); }
      }},
    ]);
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
      // Revert optimistic update on failure
      setNotes(prev => prev.map(n => n.id === noteId
        ? { ...n, user_has_liked: isLiked, likes_count: isLiked ? (n.likes_count||0)+1 : (n.likes_count||1)-1 }
        : n
      ));
    } finally {
      likingInFlight.current.delete(noteId);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You will be logged out.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        await authAPI.logout();
        onLogout?.();
      }},
    ]);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const streak     = insights?.current_streak  || 0;
  const bestStreak = insights?.longest_streak  || 0;
  const yearGoal   = insights?.yearly_goal;
  const goalPct    = yearGoal ? Math.min(100, Math.round(((yearGoal.finished || 0) / (yearGoal.goal || 1)) * 100)) : 0;
  const onTrack    = yearGoal?.on_track;

  const readingBooks = books.filter(b => b.status === 'reading').slice(0, 3);
  const followers    = profile?.followers_count ?? 0;
  const following    = profile?.following_count ?? 0;
  const totalBooks   = profile?.stats?.total_books ?? books.length;

  return (
    <View style={styles.container}>
      {/* ── Fixed header ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarLabel}>MY PROFILE</Text>
          <Text style={styles.topBarTitle}>Profile</Text>
        </View>
        <TouchableOpacity onPress={() => navigation?.navigate('Settings')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        {/* ── Profile hero ── */}
        <View style={styles.heroCard}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {profile?.profile_picture ? (
              <Image source={{ uri: profile.profile_picture }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{getInitials(profile?.name)}</Text>
              </View>
            )}
            {uploadingPhoto ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <TouchableOpacity style={styles.avatarUploadBtn} onPress={handlePhotoUpload}>
                <Ionicons name="camera" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Name / username / bio */}
          <Text style={styles.heroName}>{profile?.name || 'Reader'}</Text>
          {profile?.username && <Text style={styles.heroUsername}>@{profile.username}</Text>}
          {profile?.bio ? (
            <Text style={styles.heroBio}>{profile.bio}</Text>
          ) : (
            <TouchableOpacity onPress={() => navigation?.navigate('Settings')}>
              <Text style={styles.heroBioPlaceholder}>Add a bio in Settings…</Text>
            </TouchableOpacity>
          )}

          {/* Stats pills */}
          <View style={styles.statsPills}>
            <View style={styles.statPill}>
              <Text style={styles.statPillValue}>{followers}</Text>
              <Text style={styles.statPillLabel}>Followers</Text>
            </View>
            <View style={styles.statPillDivider} />
            <View style={styles.statPill}>
              <Text style={styles.statPillValue}>{following}</Text>
              <Text style={styles.statPillLabel}>Following</Text>
            </View>
            <View style={styles.statPillDivider} />
            <View style={styles.statPill}>
              <Text style={styles.statPillValue}>{totalBooks}</Text>
              <Text style={styles.statPillLabel}>Books</Text>
            </View>
          </View>
        </View>

        {/* ── Reading Analytics ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Reading Analytics</Text>
          <View style={styles.analyticsRow}>
            <View style={styles.analyticsItem}>
              <Ionicons name="library-outline" size={18} color={colors.primary} />
              <Text style={styles.analyticsValue}>{totalBooks}</Text>
              <Text style={styles.analyticsLabel}>Total Books</Text>
            </View>
            <View style={styles.analyticsItem}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <Text style={styles.analyticsValue}>
                {(profile?.stats?.total_pages_read ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.analyticsLabel}>Pages Read</Text>
            </View>
            {streak > 0 && (
              <View style={styles.analyticsItem}>
                <Ionicons name="flame-outline" size={18} color={colors.secondary} />
                <Text style={[styles.analyticsValue, { color: colors.secondary }]}>🔥 {streak}</Text>
                <Text style={styles.analyticsLabel}>Day Streak</Text>
              </View>
            )}
          </View>

          {/* Yearly goal ring */}
          {yearGoal && (
            <View style={styles.goalRow}>
              <GoalRing pct={goalPct} size={64} stroke={7} color={onTrack ? colors.primary : colors.secondary}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.onSurface }}>{goalPct}%</Text>
              </GoalRing>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.goalLabel}>{new Date().getFullYear()} Reading Goal</Text>
                <Text style={styles.goalValue}>{yearGoal.finished} / {yearGoal.goal} books</Text>
                <Text style={[styles.goalStatus, { color: onTrack ? colors.primary : colors.secondary }]}>
                  {onTrack ? 'On track' : 'Behind pace'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Currently Reading ── */}
        {readingBooks.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Currently Reading</Text>
            <View style={{ gap: 12, marginTop: 8 }}>
              {readingBooks.map(ub => {
                const book = ub.book;
                const pct  = (book?.total_pages > 0 && ub.current_page > 0)
                  ? Math.min(100, Math.round((ub.current_page / book.total_pages) * 100))
                  : 0;
                return (
                  <View key={ub.id} style={styles.readingRow}>
                    {book?.cover_url ? (
                      <Image source={{ uri: book.cover_url }} style={styles.readingCover} />
                    ) : (
                      <View style={[styles.readingCover, { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="book-outline" size={16} color={colors.outline} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.readingTitle} numberOfLines={2}>{book?.title}</Text>
                      <Text style={styles.readingAuthor} numberOfLines={1}>{book?.author}</Text>
                      <View style={styles.readingProgress}>
                        <View style={styles.readingTrack}>
                          <View style={[styles.readingFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={styles.readingPct}>{pct}%</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── 30-Day Activity ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>30-Day Activity</Text>
          <Text style={styles.sectionSub}>Daily pages read</Text>
          <ActivityChart data={activity} streak={streak} />
        </View>

        {/* ── My Notes ── */}
        <View style={styles.sectionCard}>
          <View style={styles.notesHeader}>
            <Text style={styles.sectionTitle}>My Notes</Text>
            <TouchableOpacity style={styles.newNoteBtn} onPress={() => { setEditNote(null); setShowNoteModal(true); }}>
              <Ionicons name="add" size={16} color={colors.onPrimary} />
              <Text style={styles.newNoteBtnText}>New Entry</Text>
            </TouchableOpacity>
          </View>

          {notes.length === 0 ? (
            <View style={styles.notesEmpty}>
              <Ionicons name="journal-outline" size={40} color={colors.outlineVariant} />
              <Text style={styles.notesEmptyText}>No notes yet</Text>
              <TouchableOpacity style={styles.notesEmptyBtn} onPress={() => { setEditNote(null); setShowNoteModal(true); }}>
                <Text style={styles.notesEmptyBtnText}>Write your first note</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 10 }}>
              {notes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  currentUserId={profile?.id}
                  onEdit={(n) => { setEditNote(n); setShowNoteModal(true); }}
                  onDelete={handleDeleteNote}
                  onLike={handleLike}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Account links ── */}
        <View style={styles.sectionCard}>
          <TouchableOpacity style={styles.accountRow} onPress={() => navigation?.navigate('Settings')}>
            <Ionicons name="settings-outline" size={18} color={colors.onSurfaceVariant} />
            <Text style={styles.accountRowText}>Account Settings</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.outline} />
          </TouchableOpacity>
          <View style={styles.accountDivider} />
          <TouchableOpacity style={styles.accountRow} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={[styles.accountRowText, { color: colors.error }]}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <NewNoteModal
        visible={showNoteModal}
        editNote={editNote}
        books={books.filter(b => b.status === 'reading')}
        onClose={() => { setShowNoteModal(false); setEditNote(null); }}
        onSaved={() => load()}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:    { flex: 1 },

  topBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, backgroundColor: colors.surface },
  topBarLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.secondary, marginBottom: 2 },
  topBarTitle: { fontSize: 28, fontWeight: '800', color: colors.primary },
  settingsBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },

  heroCard:    { backgroundColor: colors.surfaceContainerLowest, margin: 16, padding: 24, borderRadius: radius.xl, ...shadow.card, alignItems: 'center' },
  avatarWrap:  { position: 'relative', marginBottom: 14 },
  avatarImg:   { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: colors.primary },
  avatarFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { color: colors.onPrimary, fontSize: 36, fontWeight: '800' },
  avatarOverlay: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  avatarUploadBtn: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },

  heroName:    { fontSize: 22, fontWeight: '800', color: colors.onSurface, marginBottom: 2 },
  heroUsername:{ fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 8 },
  heroBio:     { fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20, marginBottom: 14, paddingHorizontal: 8 },
  heroBioPlaceholder: { fontSize: 14, color: colors.outlineVariant, fontStyle: 'italic', marginBottom: 14 },

  statsPills:     { flexDirection: 'row', alignItems: 'center' },
  statPill:       { alignItems: 'center', paddingHorizontal: 18 },
  statPillValue:  { fontSize: 18, fontWeight: '800', color: colors.onSurface },
  statPillLabel:  { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 1 },
  statPillDivider:{ width: 1, height: 28, backgroundColor: colors.outlineVariant + '60' },

  sectionCard: { backgroundColor: colors.surfaceContainerLowest, marginHorizontal: 16, marginBottom: 12, padding: 18, borderRadius: radius.lg, ...shadow.card },
  sectionTitle:{ fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
  sectionSub:  { fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 4 },

  analyticsRow:  { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  analyticsItem: { alignItems: 'center', gap: 4 },
  analyticsValue:{ fontSize: 18, fontWeight: '800', color: colors.onSurface },
  analyticsLabel:{ fontSize: 11, color: colors.onSurfaceVariant },

  goalRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh },
  goalLabel:  { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  goalValue:  { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  goalStatus: { fontSize: 12, fontWeight: '700', marginTop: 2 },

  readingRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  readingCover:   { width: 40, height: 56, borderRadius: radius.sm },
  readingTitle:   { fontSize: 13, fontWeight: '700', color: colors.onSurface, lineHeight: 18, marginBottom: 2 },
  readingAuthor:  { fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 4 },
  readingProgress:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  readingTrack:   { flex: 1, height: 4, backgroundColor: colors.surfaceContainerHigh, borderRadius: 2, overflow: 'hidden' },
  readingFill:    { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  readingPct:     { fontSize: 10, fontWeight: '700', color: colors.primary, width: 26 },

  streakBadge:    { alignSelf: 'flex-start', backgroundColor: colors.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 4 },
  streakBadgeText:{ fontSize: 12, fontWeight: '700', color: colors.primary },
  axisLabel:      { fontSize: 10, color: colors.outline },

  notesHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  newNoteBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md },
  newNoteBtnText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
  notesEmpty:     { alignItems: 'center', paddingVertical: 24, gap: 8 },
  notesEmptyText: { fontSize: 14, color: colors.onSurfaceVariant },
  notesEmptyBtn:  { backgroundColor: colors.surfaceContainerHigh, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md },
  notesEmptyBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  noteCard:    { backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, padding: 12 },
  noteHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  noteBookTag: { fontSize: 11, fontWeight: '600', color: colors.primary, marginBottom: 2 },
  noteDate:    { fontSize: 11, color: colors.outline },
  noteIconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  quoteBlock:  { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 10, marginBottom: 8 },
  quoteText:   { fontSize: 13, fontStyle: 'italic', color: colors.onSurfaceVariant, lineHeight: 19 },
  noteText:    { fontSize: 14, color: colors.onSurface, lineHeight: 21, marginBottom: 8 },
  noteFooter:  { flexDirection: 'row', gap: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh },
  noteAction:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteActionCount: { fontSize: 13, color: colors.onSurfaceVariant },

  commentsSection: { marginTop: 10, gap: 8 },
  commentRow:    { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  commentAvatarText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
  commentName:   { fontSize: 12, fontWeight: '700', color: colors.onSurface },
  commentText:   { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 18 },
  commentInput:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh, paddingTop: 8 },
  commentField:  { flex: 1, fontSize: 13, color: colors.onSurface, paddingVertical: 6 },

  accountRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  accountRowText:{ flex: 1, fontSize: 15, color: colors.onSurface, fontWeight: '500' },
  accountDivider:{ height: 1, backgroundColor: colors.surfaceContainerHigh },

  // Note modal
  modalRoot:    { flex: 1, backgroundColor: colors.surface },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '60' },
  modalCancel:  { fontSize: 15, color: colors.onSurfaceVariant },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: colors.onSurface },
  modalSave:    { fontSize: 15, color: colors.primary, fontWeight: '700' },
  fieldLabel:   { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  noteInput:    { borderWidth: 1, borderColor: colors.outlineVariant + '80', borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.onSurface, minHeight: 110, textAlignVertical: 'top', marginBottom: 16 },
  bookChip:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.outlineVariant, marginRight: 8, backgroundColor: colors.surfaceContainerLowest },
  bookChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  bookChipText: { fontSize: 13, color: colors.onSurfaceVariant },
  bookChipTextActive: { color: colors.onPrimary, fontWeight: '600' },
});
