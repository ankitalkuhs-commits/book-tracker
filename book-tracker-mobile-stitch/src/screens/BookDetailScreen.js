import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image, Modal, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { userbooksAPI, notesAPI, booksAPI } from '../services/api';
import { colors, radius, shadow, type } from '../theme';

const AMAZON_TAG_IN  = 'trackmyread-21';
const AMAZON_TAG_COM = 'trackmyread-20';

function getAmazonUrl(title, author) {
  const q  = encodeURIComponent(`${title} ${author || ''}`.trim());
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const india  = tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata';
  const domain = india ? 'amazon.in' : 'amazon.com';
  const tag    = india ? AMAZON_TAG_IN : AMAZON_TAG_COM;
  return `https://www.${domain}/s?k=${q}&tag=${tag}`;
}

const STATUS_OPTIONS = [
  { key: 'to-read',  labelKey: 'status.wantToRead', icon: 'bookmark-outline' },
  { key: 'reading',  labelKey: 'status.reading',    icon: 'book-outline' },
  { key: 'finished', labelKey: 'status.finished',   icon: 'checkmark-circle-outline' },
];

function formatNoteDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${h}:${m} ${ampm}`;
}

function StarRating({ value = 0, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} activeOpacity={0.7}>
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={24}
            color={star <= value ? colors.secondaryContainer : colors.outlineVariant}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function BookDetailScreen({ route, navigation }) {
  const { t } = useTranslation();
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
  // Modal for asking total pages when user finishes a book with no total_pages metadata
  const [totalPagesModal, setTotalPagesModal] = useState(false);
  const [totalPagesInput, setTotalPagesInput] = useState('');

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const data = await notesAPI.getNotesForBook(ub.id);
      setNotes(Array.isArray(data) ? data : []);
    } catch { setNotes([]); }
    setNotesLoading(false);
  }, [ub.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const [descExpanded, setDescExpanded] = useState(false);

  const doStatusChange = async (newStatus, newPage, newTotalPages) => {
    const prevStatus = ub.status;
    const prevPage   = ub.current_page;
    // Optimistic update
    setUb(prev => ({ ...prev, status: newStatus, current_page: newPage,
      book: newTotalPages ? { ...prev.book, total_pages: newTotalPages } : prev.book }));
    setPageInput(String(newPage));
    setSavingStatus(true);
    try {
      const payload = { status: newStatus, current_page: newPage };
      if (newTotalPages) payload.total_pages = newTotalPages;
      const result = await userbooksAPI.patchUserbook(ub.id, payload);
      setUb(prev => ({
        ...prev,
        status: result.status ?? newStatus,
        current_page: result.current_page ?? newPage,
        book: result.book_total_pages
          ? { ...prev.book, total_pages: result.book_total_pages }
          : prev.book,
      }));
    } catch (e) {
      setUb(prev => ({ ...prev, status: prevStatus, current_page: prevPage }));
      setPageInput(String(prevPage));
      Alert.alert('Error', e?.response?.data?.detail || 'Could not update status');
    }
    setSavingStatus(false);
  };

  const handleStatusChange = (newStatus) => {
    if (newStatus === ub.status) return;
    if (newStatus === 'to-read') {
      doStatusChange('to-read', 0);
    } else if (newStatus === 'reading') {
      doStatusChange('reading', 0);
    } else if (newStatus === 'finished') {
      if (!totalPages) {
        // Unknown total pages — ask the user
        setTotalPagesInput('');
        setTotalPagesModal(true);
      } else {
        doStatusChange('finished', totalPages);
      }
    }
  };

  const handleConfirmTotalPages = () => {
    const pages = parseInt(totalPagesInput, 10);
    if (isNaN(pages) || pages <= 0) {
      Alert.alert(t('common.error'), t('book.pageCountPlaceholder'));
      return;
    }
    setTotalPagesModal(false);
    doStatusChange('finished', pages, pages);
  };

  const handleSaveProgress = async () => {
    const page = parseInt(pageInput, 10);
    if (isNaN(page) || page < 0) { Alert.alert(t('common.error'), 'Enter a valid page number'); return; }
    if (totalPages > 0 && page > totalPages) {
      Alert.alert(t('common.error'), `This book only has ${totalPages} pages`);
      setPageInput(String(ub.current_page || 0));
      return;
    }
    setSavingProgress(true);
    try {
      const updated = await userbooksAPI.updateProgress(ub.id, { current_page: page });
      // Only merge the fields the progress endpoint actually updates
      setUb(prev => ({ ...prev, status: updated.status, current_page: updated.current_page ?? page }));
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not save progress'); }
    setSavingProgress(false);
  };

  const handleRating = async (stars) => {
    setRating(stars);
    try { await userbooksAPI.patchUserbook(ub.id, { rating: stars }); }
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

  const handleDeleteNote = (noteId) => Alert.alert(t('profile.deleteNote'), t('common.areYouSure'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => {
      try { await notesAPI.deleteNote(noteId); setNotes(prev => prev.filter(n => n.id !== noteId)); }
      catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not delete note'); }
    }},
  ]);

  const handleRemoveBook = () => Alert.alert(t('book.removeFromLibrary'), t('common.areYouSure'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.remove'), style: 'destructive', onPress: async () => {
      try { await userbooksAPI.deleteBook(ub.id); navigation.goBack(); }
      catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not remove book'); }
    }},
  ]);

  const progress    = totalPages > 0 ? Math.min((ub.current_page || 0) / totalPages, 1) : 0;
  const progressPct = Math.round(progress * 100);

  return (
    <View style={styles.container}>
      {/* Total pages modal — shown when marking finished with no total_pages */}
      <Modal visible={totalPagesModal} transparent animationType="fade" onRequestClose={() => setTotalPagesModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t('book.howManyPages')}</Text>
            <Text style={styles.modalSubtitle}>{t('book.pageCountPrompt')}</Text>
            <TextInput
              style={styles.modalInput}
              value={totalPagesInput}
              onChangeText={setTotalPagesInput}
              keyboardType="numeric"
              placeholder={t('book.pageCountPlaceholder')}
              placeholderTextColor={colors.outline}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setTotalPagesModal(false)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirmTotalPages}>
                <Text style={styles.modalConfirmText}>{t('common.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
          {totalPages > 0 ? <Text style={styles.bookPages}>{t('book.totalPages', { total: totalPages })}</Text> : null}
          {ub.status === 'finished' && (
            <StarRating value={rating} onChange={handleRating} />
          )}
          {book.description ? (
            <TouchableOpacity onPress={() => setDescExpanded(v => !v)} activeOpacity={0.8} style={styles.descToggle}>
              <Text style={styles.descText} numberOfLines={descExpanded ? undefined : 3}>{book.description}</Text>
              <Text style={styles.descToggleText}>{descExpanded ? t('book.showLess') : t('book.showMore')}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Buy on Amazon */}
          {book.title ? (
            <>
              <TouchableOpacity
                style={styles.amazonBtn}
                onPress={() => Linking.openURL(getAmazonUrl(book.title, book.author))}
                activeOpacity={0.8}
              >
                <Ionicons name="cart-outline" size={16} color="#92400e" />
                <Text style={styles.amazonBtnText}>{t('book.buyOnAmazon')}</Text>
              </TouchableOpacity>
              <Text style={styles.amazonDisclaimer}>{t('book.affiliateDisclaimer')}</Text>
            </>
          ) : null}
        </View>

        {/* ── Status ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('book.sectionStatus')}</Text>
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
                  {t(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {savingStatus && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
        </View>

        {/* ── Reading Progress (reading only) ── */}
        {ub.status === 'reading' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('book.sectionProgress')}</Text>
            <View style={styles.progressCard}>
              <View style={styles.progressTopRow}>
                <Text style={styles.progressPagesText}>
                  {t('book.pagesProgress', { current: ub.current_page || 0, total: totalPages || '?' })}
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
                  placeholder={t('book.currentPagePlaceholder')}
                  placeholderTextColor={colors.outline}
                />
                <TouchableOpacity style={styles.updateBtn} onPress={handleSaveProgress} disabled={savingProgress}>
                  {savingProgress
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Text style={styles.updateBtnText}>{t('book.updateProgress')}</Text>
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
          <Text style={styles.sectionLabel}>{t('book.sectionNotes')}</Text>

          {/* Composer — always visible */}
          <View style={styles.noteComposer}>
            <TextInput
              style={styles.noteTextInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder={t('book.writeReflection')}
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
                placeholder={t('book.addQuoteOptional')}
                placeholderTextColor={colors.outline}
              />
              <TouchableOpacity
                style={[styles.postBtn, (!noteText.trim() && !noteQuote.trim()) && { opacity: 0.4 }]}
                onPress={handleAddNote}
                disabled={savingNote || (!noteText.trim() && !noteQuote.trim())}
              >
                {savingNote
                  ? <ActivityIndicator size="small" color={colors.onPrimary} />
                  : <Text style={styles.postBtnText}>{t('common.post')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Notes list */}
          {notesLoading ? (
            <Text style={styles.notesLoadingText}>{t('book.loadingNotes')}</Text>
          ) : notes.length === 0 ? (
            <Text style={styles.notesEmptyText}>{t('book.noNotesYet')}</Text>
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
                  <Text style={styles.noteTime}>{formatNoteDate(n.created_at)}</Text>
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
          <Text style={styles.removeLinkText}>{t('book.removeFromLibrary')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface },
  backBtn:     { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { ...type.title, flex: 1, color: colors.onSurface, textAlign: 'center', marginHorizontal: 8 },

  coverSection:    { alignItems: 'center', paddingTop: 20, paddingBottom: 16, paddingHorizontal: 24 },
  coverCard:       { borderRadius: radius.lg, overflow: 'hidden', marginBottom: 16, ...shadow.float },
  coverImage:      { width: 140, height: 200 },
  coverPlaceholder:{ width: 140, height: 200, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  bookTitle:       { ...type.titleLg, color: colors.onSurface, textAlign: 'center', marginBottom: 4 },
  bookAuthor:      { ...type.body, color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 4 },
  bookPages:       { ...type.label, color: colors.outline },
  descToggle:      { marginTop: 10, paddingHorizontal: 4 },
  descText:        { ...type.bodySm, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  descToggleText:  { ...type.label, color: colors.primary, textAlign: 'center', marginTop: 4 },

  amazonBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, paddingVertical: 10, paddingHorizontal: 20, borderRadius: radius.lg, borderWidth: 1.5, borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  amazonBtnText:     { fontSize: 14, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: '#92400e' },
  amazonDisclaimer:  { ...type.caption, color: colors.outline, textAlign: 'center', marginTop: 6 },

  section:      { marginTop: 20, paddingHorizontal: 16 },
  sectionLabel: { ...type.eyebrow, color: colors.onSurfaceVariant, marginBottom: 12 },

  // Status pills — segmented style
  statusRow:          { flexDirection: 'row', backgroundColor: colors.surfaceContainerHigh, borderRadius: radius.full, padding: 3, gap: 3 },
  statusPill:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.full, paddingVertical: 8 },
  statusPillActive:   { backgroundColor: colors.primary },
  statusPillText:     { ...type.label, color: colors.onSurfaceVariant },
  statusPillTextActive: { color: colors.onPrimary },

  // Progress
  progressCard:     { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 16, ...shadow.card },
  progressTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressPagesText:{ ...type.bodySm, color: colors.onSurfaceVariant },
  progressPct:      { ...type.bodySm, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.primary },
  progressBarTrack: { height: 6, backgroundColor: colors.surfaceContainerHighest, borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
  progressBarFill:  { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  pageInputRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageInput:        { ...type.body, flex: 1, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  updateBtn:        { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', minWidth: 72 },
  updateBtnText:    { ...type.body, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', color: colors.onPrimary },

  // Page alt (non-reading)
  pageAltRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageAltHint: { ...type.caption, color: colors.outline, lineHeight: 16, flexShrink: 1 },

  // Notes composer
  noteComposer:   { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, overflow: 'hidden', marginBottom: 14, ...shadow.card },
  noteTextInput:  { ...type.body, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, color: colors.onSurface, minHeight: 80 },
  noteQuoteRow:   { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.outlineVariant + '40', paddingHorizontal: 10, paddingVertical: 8 },
  noteQuoteInput: { ...type.bodySm, flex: 1, color: colors.onSurface, paddingVertical: 4 },
  postBtn:        { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 7 },
  postBtnText:    { ...type.label, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },

  notesLoadingText: { ...type.bodySm, color: colors.outline, marginTop: 8 },
  notesEmptyText:   { ...type.bodySm, color: colors.onSurfaceVariant, marginTop: 4, marginBottom: 4 },

  noteCard:       { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.md, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colors.primary, ...shadow.card },
  noteText:       { ...type.body, color: colors.onSurface },
  noteQuoteBlock: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.primaryContainer },
  noteQuoteText:  { ...type.bodySm, fontFamily: 'NotoSerif_400Italic', color: colors.onSurfaceVariant },
  noteFooter:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  noteTime:       { ...type.caption, color: colors.outline },

  removeLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, marginBottom: 8 },
  removeLinkText: { ...type.body, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', color: colors.error },

  // Total pages modal
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:       { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 24, width: '100%', ...shadow.float },
  modalTitle:     { ...type.titleLg, color: colors.onSurface, marginBottom: 8 },
  modalSubtitle:  { ...type.bodySm, color: colors.onSurfaceVariant, marginBottom: 16, lineHeight: 20 },
  modalInput:     { ...type.body, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60', marginBottom: 20 },
  modalActions:   { flexDirection: 'row', gap: 10 },
  modalCancel:    { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outlineVariant, alignItems: 'center' },
  modalCancelText:{ ...type.label, color: colors.onSurfaceVariant },
  modalConfirm:   { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  modalConfirmText:{ ...type.label, color: colors.onPrimary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
});
