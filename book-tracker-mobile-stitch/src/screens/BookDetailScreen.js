import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userbooksAPI, notesAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

const STATUS_OPTIONS = [
  { key: 'to-read',  label: 'Want to Read', icon: 'bookmark-outline' },
  { key: 'reading',  label: 'Reading',       icon: 'book-outline' },
  { key: 'finished', label: 'Finished',      icon: 'checkmark-circle-outline' },
];

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StarRating({ value = 0, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} activeOpacity={0.7}>
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={24}
            color={star <= value ? colors.secondary : colors.outlineVariant}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function BookDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { userbook: initialUb } = route.params;
  const [ub, setUb]               = useState(initialUb);
  const book                       = ub.book || {};
  const totalPages                 = book.total_pages || 0;

  const [notes,           setNotes]           = useState([]);
  const [notesLoading,    setNotesLoading]    = useState(true);
  const [pageInput,       setPageInput]       = useState(String(ub.current_page || ''));
  const [savingProgress,  setSavingProgress]  = useState(false);
  const [savingStatus,    setSavingStatus]    = useState(false);
  const [noteText,        setNoteText]        = useState('');
  const [noteQuote,       setNoteQuote]       = useState('');
  const [savingNote,      setSavingNote]      = useState(false);
  const [rating,          setRating]          = useState(ub.rating || 0);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const data = await notesAPI.getNotesForBook(ub.id);
      setNotes(Array.isArray(data) ? data : []);
    } catch { setNotes([]); }
    setNotesLoading(false);
  }, [ub.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const handleStatusChange = async (newStatus) => {
    if (newStatus === ub.status) return;
    setSavingStatus(true);
    try {
      const updated = newStatus === 'finished'
        ? await userbooksAPI.finishBook(ub.id)
        : await userbooksAPI.updateProgress(ub.id, { status: newStatus });
      setUb(prev => ({ ...prev, ...updated }));
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not update status'); }
    setSavingStatus(false);
  };

  const handleSaveProgress = async () => {
    const page = parseInt(pageInput, 10);
    if (isNaN(page) || page < 0) { Alert.alert('Invalid page', 'Enter a valid page number'); return; }
    setSavingProgress(true);
    try {
      const updated = await userbooksAPI.updateProgress(ub.id, { current_page: page });
      setUb(prev => ({ ...prev, ...updated, current_page: page }));
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not save progress'); }
    setSavingProgress(false);
  };

  const handleRating = async (stars) => {
    setRating(stars);
    try { await userbooksAPI.updateProgress(ub.id, { rating: stars }); }
    catch { setRating(rating); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() && !noteQuote.trim()) return;
    setSavingNote(true);
    try {
      const n = await notesAPI.createNote({ userbook_id: ub.id, text: noteText.trim(), quote: noteQuote.trim() });
      setNotes(prev => [n, ...prev]);
      setNoteText(''); setNoteQuote('');
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not save note'); }
    setSavingNote(false);
  };

  const handleDeleteNote = (noteId) => Alert.alert('Delete note', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await notesAPI.deleteNote(noteId); setNotes(prev => prev.filter(n => n.id !== noteId)); }
      catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not delete note'); }
    }},
  ]);

  const handleRemoveBook = () => Alert.alert('Remove book', 'Remove this book from your library?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      try { await userbooksAPI.deleteBook(ub.id); navigation.goBack(); }
      catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not remove book'); }
    }},
  ]);

  const progress    = totalPages > 0 ? Math.min((ub.current_page || 0) / totalPages, 1) : 0;
  const progressPct = Math.round(progress * 100);

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{book.title || 'Book'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Cover + meta ── */}
        <View style={styles.coverSection}>
          <View style={styles.coverCard}>
            {book.cover_url ? (
              <Image source={{ uri: book.cover_url }} style={styles.coverImage} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="book" size={48} color={colors.primary} />
              </View>
            )}
          </View>
          <Text style={styles.bookTitle}>{book.title || 'Unknown Title'}</Text>
          {book.author ? <Text style={styles.bookAuthor}>{book.author}</Text> : null}
          {totalPages > 0 ? <Text style={styles.bookPages}>{totalPages} pages</Text> : null}
          {ub.status === 'finished' && (
            <StarRating value={rating} onChange={handleRating} />
          )}
        </View>

        {/* ── Status ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>STATUS</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.statusPill, ub.status === opt.key && styles.statusPillActive]}
                onPress={() => handleStatusChange(opt.key)}
                disabled={savingStatus}
              >
                <Ionicons name={opt.icon} size={13} color={ub.status === opt.key ? colors.onPrimary : colors.onSurfaceVariant} />
                <Text style={[styles.statusPillText, ub.status === opt.key && styles.statusPillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {savingStatus && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
        </View>

        {/* ── Reading Progress (reading only) ── */}
        {ub.status === 'reading' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>READING PROGRESS</Text>
            <View style={styles.progressCard}>
              <View style={styles.progressTopRow}>
                <Text style={styles.progressPagesText}>
                  {ub.current_page || 0} of {totalPages || '?'} pages
                </Text>
                <Text style={styles.progressPct}>{progressPct}%</Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              </View>
              <View style={styles.pageInputRow}>
                <TextInput
                  style={styles.pageInput}
                  value={pageInput}
                  onChangeText={setPageInput}
                  keyboardType="numeric"
                  placeholder="Current page"
                  placeholderTextColor={colors.outline}
                />
                <TouchableOpacity style={styles.updateBtn} onPress={handleSaveProgress} disabled={savingProgress}>
                  {savingProgress
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Text style={styles.updateBtnText}>Update</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Page field for non-reading statuses ── */}
        {ub.status !== 'reading' && (
          <View style={styles.section}>
            <View style={styles.pageAltRow}>
              <TextInput
                style={[styles.pageInput, { flex: 1 }]}
                value={pageInput}
                onChangeText={setPageInput}
                onEndEditing={handleSaveProgress}
                keyboardType="numeric"
                placeholder="Currently on page... (optional)"
                placeholderTextColor={colors.outline}
              />
              <Text style={styles.pageAltHint}>Used when switching{'\n'}to Reading</Text>
            </View>
          </View>
        )}

        {/* ── Notes & Reflections ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NOTES & REFLECTIONS</Text>

          {/* Composer — always visible */}
          <View style={styles.noteComposer}>
            <TextInput
              style={styles.noteTextInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Write a reflection about this book..."
              placeholderTextColor={colors.outline}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.noteQuoteRow}>
              <Ionicons name="chatbox-outline" size={14} color={colors.outline} style={{ marginRight: 6, marginTop: 1 }} />
              <TextInput
                style={styles.noteQuoteInput}
                value={noteQuote}
                onChangeText={setNoteQuote}
                placeholder="Add a quote (optional)..."
                placeholderTextColor={colors.outline}
              />
              <TouchableOpacity
                style={[styles.postBtn, (!noteText.trim() && !noteQuote.trim()) && { opacity: 0.4 }]}
                onPress={handleAddNote}
                disabled={savingNote || (!noteText.trim() && !noteQuote.trim())}
              >
                {savingNote
                  ? <ActivityIndicator size="small" color={colors.onPrimary} />
                  : <Text style={styles.postBtnText}>Post</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Notes list */}
          {notesLoading ? (
            <Text style={styles.notesLoadingText}>Loading notes...</Text>
          ) : notes.length === 0 ? (
            <Text style={styles.notesEmptyText}>No notes yet. Write your first reflection above.</Text>
          ) : (
            notes.map(n => (
              <View key={n.id} style={styles.noteCard}>
                {n.text ? <Text style={styles.noteText}>{n.text}</Text> : null}
                {n.quote ? (
                  <View style={styles.noteQuoteBlock}>
                    <Text style={styles.noteQuoteText}>"{n.quote}"</Text>
                  </View>
                ) : null}
                <View style={styles.noteFooter}>
                  <Text style={styles.noteTime}>{timeAgo(n.created_at)}</Text>
                  <TouchableOpacity onPress={() => handleDeleteNote(n.id)}>
                    <Ionicons name="trash-outline" size={15} color={colors.outline} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Remove from library ── */}
        <TouchableOpacity style={styles.removeLink} onPress={handleRemoveBook}>
          <Ionicons name="trash-outline" size={15} color={colors.error} />
          <Text style={styles.removeLinkText}>Remove from library</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface },
  backBtn:     { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.onSurface, textAlign: 'center', marginHorizontal: 8 },

  coverSection:    { alignItems: 'center', paddingTop: 20, paddingBottom: 16, paddingHorizontal: 24 },
  coverCard:       { borderRadius: radius.lg, overflow: 'hidden', marginBottom: 16, ...shadow.float },
  coverImage:      { width: 140, height: 200 },
  coverPlaceholder:{ width: 140, height: 200, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  bookTitle:       { fontSize: 22, fontWeight: '800', color: colors.onSurface, textAlign: 'center', marginBottom: 4 },
  bookAuthor:      { fontSize: 15, color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 4 },
  bookPages:       { fontSize: 12, color: colors.outline },

  section:      { marginTop: 20, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.onSurfaceVariant, marginBottom: 12, textTransform: 'uppercase' },

  // Status pills — segmented style
  statusRow:          { flexDirection: 'row', backgroundColor: colors.surfaceContainerHigh, borderRadius: radius.full, padding: 3, gap: 3 },
  statusPill:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.full, paddingVertical: 8 },
  statusPillActive:   { backgroundColor: colors.primary },
  statusPillText:     { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant },
  statusPillTextActive: { color: colors.onPrimary },

  // Progress
  progressCard:     { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 16, ...shadow.card },
  progressTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressPagesText:{ fontSize: 13, color: colors.onSurfaceVariant },
  progressPct:      { fontSize: 13, fontWeight: '700', color: colors.primary },
  progressBarTrack: { height: 6, backgroundColor: colors.surfaceContainerHighest, borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
  progressBarFill:  { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  pageInputRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageInput:        { flex: 1, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  updateBtn:        { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', minWidth: 72 },
  updateBtnText:    { fontSize: 14, fontWeight: '600', color: colors.onPrimary },

  // Page alt (non-reading)
  pageAltRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageAltHint: { fontSize: 11, color: colors.outline, lineHeight: 16, flexShrink: 1 },

  // Notes composer
  noteComposer:   { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, overflow: 'hidden', marginBottom: 14, ...shadow.card },
  noteTextInput:  { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, fontSize: 14, color: colors.onSurface, minHeight: 80 },
  noteQuoteRow:   { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.outlineVariant + '40', paddingHorizontal: 10, paddingVertical: 8 },
  noteQuoteInput: { flex: 1, fontSize: 13, color: colors.onSurface, paddingVertical: 4 },
  postBtn:        { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 7 },
  postBtnText:    { fontSize: 13, fontWeight: '700', color: colors.onPrimary },

  notesLoadingText: { fontSize: 13, color: colors.outline, marginTop: 8 },
  notesEmptyText:   { fontSize: 13, color: colors.onSurfaceVariant, marginTop: 4, marginBottom: 4 },

  noteCard:       { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.md, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colors.primary, ...shadow.card },
  noteText:       { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  noteQuoteBlock: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.primaryContainer },
  noteQuoteText:  { fontSize: 13, fontStyle: 'italic', color: colors.onSurfaceVariant, lineHeight: 18 },
  noteFooter:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  noteTime:       { fontSize: 11, color: colors.outline },

  removeLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, marginBottom: 8 },
  removeLinkText: { fontSize: 14, color: colors.error, fontWeight: '600' },
});
