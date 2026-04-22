import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, StatusBar, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { userbooksAPI, notesAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

const STATUS_OPTIONS = [
  { key: 'to-read',  label: 'To Read',  icon: 'bookmark-outline' },
  { key: 'reading',  label: 'Reading',  icon: 'book-outline' },
  { key: 'finished', label: 'Finished', icon: 'checkmark-circle-outline' },
];

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function BookDetailScreen({ route, navigation }) {
  // LibraryScreen passes the full userbook item
  const { userbook: initialUb } = route.params;
  const [ub, setUb] = useState(initialUb);
  const book = ub.book || {};
  const totalPages = book.total_pages || 0;

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [pageInput, setPageInput] = useState(String(ub.current_page || ''));
  const [savingProgress, setSavingProgress] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  // Add note state
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteQuote, setNoteQuote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

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
      let updated;
      if (newStatus === 'finished') {
        updated = await userbooksAPI.finishBook(ub.id);
      } else {
        updated = await userbooksAPI.updateProgress(ub.id, { status: newStatus });
      }
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

  const handleAddNote = async () => {
    if (!noteText.trim() && !noteQuote.trim()) return;
    setSavingNote(true);
    try {
      const n = await notesAPI.createNote({ userbook_id: ub.id, text: noteText.trim(), quote: noteQuote.trim() });
      setNotes(prev => [n, ...prev]);
      setNoteText(''); setNoteQuote(''); setShowNoteForm(false);
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not save note'); }
    setSavingNote(false);
  };

  const handleDeleteNote = (noteId) => {
    Alert.alert('Delete note', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await notesAPI.deleteNote(noteId); setNotes(prev => prev.filter(n => n.id !== noteId)); }
        catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not delete note'); }
      }},
    ]);
  };

  const handleRemoveBook = () => {
    Alert.alert('Remove book', 'Remove this book from your library?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await userbooksAPI.deleteBook(ub.id); navigation.goBack(); }
        catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not remove book'); }
      }},
    ]);
  };

  const progress = totalPages > 0 ? Math.min((ub.current_page || 0) / totalPages, 1) : 0;
  const progressPct = Math.round(progress * 100);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{book.title || 'Book'}</Text>
        <TouchableOpacity onPress={handleRemoveBook} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover card */}
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
          {totalPages > 0 ? (
            <Text style={styles.bookPages}>{totalPages} pages</Text>
          ) : null}
        </View>

        {/* Status pills */}
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
                <Ionicons name={opt.icon} size={14} color={ub.status === opt.key ? colors.onPrimary : colors.primary} />
                <Text style={[styles.statusPillText, ub.status === opt.key && styles.statusPillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {savingStatus && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
        </View>

        {/* Progress */}
        {ub.status === 'reading' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PROGRESS</Text>
            <View style={styles.progressCard}>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              </View>
              <Text style={styles.progressPct}>{progressPct}%</Text>
              <View style={styles.pageInputRow}>
                <TextInput
                  style={styles.pageInput}
                  value={pageInput}
                  onChangeText={setPageInput}
                  keyboardType="numeric"
                  placeholder="Current page"
                  placeholderTextColor={colors.outline}
                />
                {totalPages > 0 && <Text style={styles.pageSep}>/ {totalPages}</Text>}
                <TouchableOpacity style={styles.savePageBtn} onPress={handleSaveProgress} disabled={savingProgress}>
                  {savingProgress
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Text style={styles.savePageBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>NOTES</Text>
            <TouchableOpacity onPress={() => setShowNoteForm(v => !v)} style={styles.addNoteBtn}>
              <Ionicons name={showNoteForm ? 'close' : 'add'} size={16} color={colors.primary} />
              <Text style={styles.addNoteBtnText}>{showNoteForm ? 'Cancel' : 'Add note'}</Text>
            </TouchableOpacity>
          </View>

          {showNoteForm && (
            <View style={styles.noteForm}>
              <TextInput
                style={styles.noteInput}
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Write a note or thought…"
                placeholderTextColor={colors.outline}
                multiline
                numberOfLines={3}
              />
              <TextInput
                style={[styles.noteInput, { marginTop: 8 }]}
                value={noteQuote}
                onChangeText={setNoteQuote}
                placeholder="Quote from the book (optional)"
                placeholderTextColor={colors.outline}
                multiline
                numberOfLines={2}
              />
              <TouchableOpacity style={styles.saveNoteBtn} onPress={handleAddNote} disabled={savingNote}>
                {savingNote
                  ? <ActivityIndicator size="small" color={colors.onPrimary} />
                  : <Text style={styles.saveNoteBtnText}>Save Note</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {notesLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 16 }} />
          ) : notes.length === 0 ? (
            <View style={styles.notesEmpty}>
              <Text style={styles.notesEmptyText}>No notes yet — add your first thought</Text>
            </View>
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: colors.surface },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.onSurface, textAlign: 'center', marginHorizontal: 8 },
  removeBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.error + '12', alignItems: 'center', justifyContent: 'center' },

  coverSection: { alignItems: 'center', paddingTop: 20, paddingBottom: 8, paddingHorizontal: 24 },
  coverCard: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: 16, ...shadow.float },
  coverImage: { width: 140, height: 200 },
  coverPlaceholder: { width: 140, height: 200, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontSize: 22, fontWeight: '800', color: colors.onSurface, textAlign: 'center', marginBottom: 4 },
  bookAuthor: { fontSize: 15, color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 4 },
  bookPages: { fontSize: 12, color: colors.outline },

  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.onSurfaceVariant, marginBottom: 10, textTransform: 'uppercase' },

  statusRow: { flexDirection: 'row', gap: 8 },
  statusPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: radius.full, paddingVertical: 9, paddingHorizontal: 6, borderWidth: 1.5, borderColor: colors.primary },
  statusPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusPillText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  statusPillTextActive: { color: colors.onPrimary },

  progressCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 16, ...shadow.card },
  progressBarTrack: { height: 8, backgroundColor: colors.surfaceContainerHighest, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  progressPct: { fontSize: 13, fontWeight: '600', color: colors.primary, marginBottom: 12 },
  pageInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageInput: { flex: 1, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  pageSep: { fontSize: 14, color: colors.onSurfaceVariant },
  savePageBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 9, minWidth: 60, alignItems: 'center' },
  savePageBtnText: { fontSize: 14, fontWeight: '600', color: colors.onPrimary },

  addNoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '12', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  addNoteBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  noteForm: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, marginBottom: 12, ...shadow.card },
  noteInput: { backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60', textAlignVertical: 'top', minHeight: 70 },
  saveNoteBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  saveNoteBtnText: { fontSize: 14, fontWeight: '700', color: colors.onPrimary },

  notesEmpty: { paddingVertical: 20, alignItems: 'center' },
  notesEmptyText: { fontSize: 13, color: colors.onSurfaceVariant, fontStyle: 'italic' },

  noteCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.md, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colors.primary, ...shadow.card },
  noteText: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  noteQuoteBlock: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.primaryContainer },
  noteQuoteText: { fontSize: 13, fontStyle: 'italic', color: colors.onSurfaceVariant, lineHeight: 18 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  noteTime: { fontSize: 11, color: colors.outline },
});
