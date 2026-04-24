import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Image, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Modal, ScrollView,
  Dimensions, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { userbooksAPI, booksAPI } from '../services/api';
import { PreloadContext } from '../../App';
import { colors, radius, shadow, type } from '../theme';
import AppHeader from '../components/AppHeader';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_PAD = 14;
const GRID_GAP  = 12;
const TILE_W    = (SCREEN_W - GRID_PAD * 2 - GRID_GAP) / 2;
const TILE_H    = TILE_W * (4 / 3);
const COVER_W   = TILE_W * 0.52;
const COVER_H   = COVER_W * 1.5;
const SPINE_W   = 5;

// Colour palettes for book tiles
const PALETTES = [
  { bg: '#e0f2f1', spine: '#00695c', text: colors.primary },
  { bg: '#e8f5e9', spine: '#2e7d32', text: '#2e7d32' },
  { bg: '#fff8e1', spine: '#e65100', text: '#e65100' },
  { bg: '#fce4ec', spine: '#880e4f', text: '#880e4f' },
  { bg: '#e8eaf6', spine: '#283593', text: '#283593' },
  { bg: '#f3e5f5', spine: '#6a1b9a', text: '#6a1b9a' },
  { bg: '#e3f2fd', spine: '#1565c0', text: '#1565c0' },
  { bg: '#fbe9e7', spine: '#bf360c', text: '#bf360c' },
];

function getPalette(id) {
  return PALETTES[(id || 0) % PALETTES.length];
}

// ── 3D Book Cover ─────────────────────────────────────────────────────────────
function Book3D({ coverUrl, title, palette }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          transform: [{ perspective: 700 }, { rotateY: '-12deg' }],
          shadowColor: '#000',
          shadowOffset: { width: 5, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 10,
          elevation: 8,
        }}
      >
        {/* Spine */}
        <View
          style={{
            width: SPINE_W,
            height: COVER_H,
            backgroundColor: palette.spine,
            borderTopLeftRadius: 3,
            borderBottomLeftRadius: 3,
          }}
        />
        {/* Cover */}
        {!failed && coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={{
              width: COVER_W,
              height: COVER_H,
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
            }}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View
            style={{
              width: COVER_W,
              height: COVER_H,
              backgroundColor: palette.spine + '30',
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 6,
            }}
          >
            <Ionicons name="book-outline" size={28} color={palette.spine} style={{ marginBottom: 6 }} />
            <Text style={{ fontSize: 9, fontWeight: '700', color: palette.spine, textAlign: 'center', lineHeight: 13 }} numberOfLines={5}>
              {title}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Star Rating ───────────────────────────────────────────────────────────────
function StarRating({ rating, small }) {
  if (!rating) return null;
  const stars = Math.round(rating);
  const size = small ? 10 : 12;
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons
          key={i}
          name={i <= stars ? 'star' : 'star-outline'}
          size={size}
          color={i <= stars ? colors.secondary : colors.outlineVariant}
        />
      ))}
    </View>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  if (!total || total <= 0) return null;
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{pct}%</Text>
    </View>
  );
}

// ── Book Tile (grid cell) ─────────────────────────────────────────────────────
function BookTile({ userbook, onPress }) {
  const palette = getPalette(userbook.id);
  const book    = userbook.book;
  const isReading  = userbook.status === 'reading';
  const isFinished = userbook.status === 'finished';

  return (
    <TouchableOpacity style={[styles.tile, { width: TILE_W }]} onPress={onPress} activeOpacity={0.82}>
      {/* Coloured tile background */}
      <View style={[styles.tileInner, { backgroundColor: palette.bg, height: TILE_H }]}>
        <Book3D coverUrl={book?.cover_url} title={book?.title} palette={palette} />

        {/* Status badge */}
        {isReading && (
          <View style={[styles.statusBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.statusBadgeText}>Reading</Text>
          </View>
        )}
        {isFinished && (
          <View style={[styles.statusBadge, { backgroundColor: colors.secondary }]}>
            <Text style={styles.statusBadgeText}>Finished</Text>
          </View>
        )}
        {userbook.status === 'to-read' && (
          <View style={[styles.statusBadge, { backgroundColor: colors.tertiary }]}>
            <Text style={styles.statusBadgeText}>Want</Text>
          </View>
        )}
      </View>

      {/* Info below tile */}
      <View style={styles.tileInfo}>
        <Text style={styles.tileTitle} numberOfLines={2}>{book?.title || 'Untitled'}</Text>
        <Text style={[styles.tileAuthor, { color: palette.text }]} numberOfLines={1}>{book?.author || ''}</Text>
        <Text style={styles.tileStatus}>
          {isReading ? 'READING' : isFinished ? 'FINISHED' : 'WANT TO READ'}
        </Text>

        {isReading && book?.total_pages > 0 && (
          <ProgressBar current={userbook.current_page || 0} total={book.total_pages} />
        )}

        {isFinished && userbook.rating > 0 && (
          <StarRating rating={userbook.rating} small />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Add Book Modal ─────────────────────────────────────────────────────────────
function AddBookModal({ visible, onClose, onAdded }) {
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState([]);
  const [searching, setSearching]       = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookStatus, setBookStatus]     = useState('to-read');
  const [bookFormat, setBookFormat]     = useState('paperback');
  const [ownership, setOwnership]       = useState('owned');
  const [adding, setAdding]             = useState(false);

  const searchBooks = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const res = await booksAPI.search(query.trim());
      setResults(res || []);
    } catch { Alert.alert('Error', 'Search failed'); }
    finally { setSearching(false); }
  };

  const addBook = async () => {
    if (!selectedBook) return;
    setAdding(true);
    try {
      await booksAPI.addToLibrary({
        title: selectedBook.title,
        author: selectedBook.authors?.join(', ') || 'Unknown',
        isbn: selectedBook.isbn_13 || selectedBook.isbn_10,
        cover_url: selectedBook.cover_url,
        description: selectedBook.description,
        total_pages: selectedBook.total_pages,
        publisher: selectedBook.publisher,
        published_date: selectedBook.published_date,
        google_books_id: selectedBook.google_id,
        status: bookStatus,
        current_page: 0,
        format: bookFormat,
        ownership_status: ownership,
      });
      Alert.alert('Added!', `"${selectedBook.title}" is in your library.`);
      onAdded();
      handleClose();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not add book');
    } finally { setAdding(false); }
  };

  const handleClose = () => {
    setQuery(''); setResults([]); setSelectedBook(null);
    setBookStatus('to-read'); setBookFormat('paperback'); setOwnership('owned');
    onClose();
  };

  const OptionChip = ({ label, active, onPress }) => (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add Book</Text>
          <View style={{ width: 56 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {!selectedBook ? (
            /* ── Search panel ── */
            <View style={{ flex: 1 }}>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by title or author…"
                  placeholderTextColor={colors.outline}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={searchBooks}
                  returnKeyType="search"
                  autoFocus
                />
                <TouchableOpacity style={styles.searchBtn} onPress={searchBooks} disabled={searching}>
                  {searching
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Ionicons name="search" size={20} color={colors.onPrimary} />
                  }
                </TouchableOpacity>
              </View>

              {results.length === 0 && !searching ? (
                <View style={styles.searchEmpty}>
                  <Ionicons name="search-outline" size={48} color={colors.outlineVariant} />
                  <Text style={styles.searchEmptyText}>Search for a book to add</Text>
                </View>
              ) : (
                <FlatList
                  data={results}
                  keyExtractor={(_, i) => i.toString()}
                  contentContainerStyle={styles.resultsList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.resultCard}
                      onPress={() => setSelectedBook(item)}
                      activeOpacity={0.8}
                    >
                      {/* Cover — overflows above the card */}
                      <View style={styles.resultCoverWrap}>
                        <Image
                          source={{ uri: item.cover_url }}
                          style={styles.resultCover}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
                        <Text style={styles.resultAuthor} numberOfLines={1}>
                          {item.authors?.join(', ') || 'Unknown'}
                        </Text>
                        {item.publisher ? (
                          <Text style={styles.resultPublisher} numberOfLines={1}>{item.publisher}</Text>
                        ) : item.total_pages > 0 ? (
                          <Text style={styles.resultPublisher}>{item.total_pages} pages</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.outline} style={{ alignSelf: 'center' }} />
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          ) : (
            /* ── Options panel ── */
            <ScrollView contentContainerStyle={styles.optionsScroll}>
              {/* Back */}
              <TouchableOpacity onPress={() => setSelectedBook(null)} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={18} color={colors.primary} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>

              {/* Hero: large cover + meta */}
              <View style={styles.selectedHero}>
                <Image
                  source={{ uri: selectedBook.cover_url }}
                  style={styles.selectedCoverLarge}
                  resizeMode="cover"
                />
                <View style={styles.selectedMeta}>
                  <Text style={styles.selectedTitle} numberOfLines={3}>{selectedBook.title}</Text>
                  <Text style={styles.selectedAuthor}>
                    {selectedBook.authors?.join(', ') || 'Unknown'}
                  </Text>
                  {selectedBook.publisher ? (
                    <Text style={styles.selectedPublisher}>{selectedBook.publisher}</Text>
                  ) : null}
                  {selectedBook.published_date ? (
                    <Text style={styles.selectedPublisher}>{selectedBook.published_date.slice(0, 4)}</Text>
                  ) : null}
                  {selectedBook.total_pages > 0 ? (
                    <Text style={styles.selectedPages}>{selectedBook.total_pages} pages</Text>
                  ) : null}
                </View>
              </View>

              {/* Description */}
              {selectedBook.description ? (
                <View style={styles.descriptionBox}>
                  <Text style={styles.descriptionText} numberOfLines={5}>{selectedBook.description}</Text>
                </View>
              ) : null}

              {/* Status */}
              <Text style={styles.optionLabel}>Add to</Text>
              <View style={styles.chipRow}>
                {['to-read', 'reading', 'finished'].map(s => (
                  <OptionChip
                    key={s}
                    label={s === 'to-read' ? 'Want to Read' : s === 'reading' ? 'Reading' : 'Finished'}
                    active={bookStatus === s}
                    onPress={() => setBookStatus(s)}
                  />
                ))}
              </View>

              {/* Format */}
              <Text style={styles.optionLabel}>Format</Text>
              <View style={styles.chipRow}>
                {['paperback', 'hardcover', 'ebook', 'kindle', 'audiobook'].map(f => (
                  <OptionChip key={f} label={f.charAt(0).toUpperCase() + f.slice(1)} active={bookFormat === f} onPress={() => setBookFormat(f)} />
                ))}
              </View>

              {/* Ownership */}
              <Text style={styles.optionLabel}>Ownership</Text>
              <View style={styles.chipRow}>
                {['owned', 'borrowed', 'loaned'].map(o => (
                  <OptionChip key={o} label={o.charAt(0).toUpperCase() + o.slice(1)} active={ownership === o} onPress={() => setOwnership(o)} />
                ))}
              </View>

              {/* Add button */}
              <TouchableOpacity
                style={[styles.addBtn, adding && { opacity: 0.6 }]}
                onPress={addBook}
                disabled={adding}
              >
                {adding
                  ? <ActivityIndicator size="small" color={colors.onPrimary} />
                  : <Text style={styles.addBtnText}>Add to Library</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Library Screen ─────────────────────────────────────────────────────────────
export default function LibraryScreen({ navigation }) {
  const preloaded  = useContext(PreloadContext);
  const currentUser = preloaded?.profile || null;
  const [books, setBooks]         = useState(preloaded?.library || []);
  const [loading, setLoading]     = useState(!preloaded?.library);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const loadBooks = useCallback(async () => {
    try {
      const data = await userbooksAPI.getMyBooks();
      setBooks(data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    if (!preloaded?.library) loadBooks();
  }, []);

  useFocusEffect(useCallback(() => { loadBooks(); }, [loadBooks]));

  const onRefresh = () => { setRefreshing(true); loadBooks(); };

  const getFiltered = () => {
    let list = books;
    if (activeTab !== 'all') list = list.filter(b => b.status === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b =>
        (b.book?.title || '').toLowerCase().includes(q) ||
        (b.book?.author || '').toLowerCase().includes(q)
      );
    }
    return list;
  };

  const TABS = [
    { key: 'all',      label: 'All',         count: books.length },
    { key: 'reading',  label: 'Reading',     count: books.filter(b => b.status === 'reading').length },
    { key: 'to-read',  label: 'Want to Read',count: books.filter(b => b.status === 'to-read').length },
    { key: 'finished', label: 'Finished',    count: books.filter(b => b.status === 'finished').length },
  ];

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const filtered = getFiltered();

  return (
    <View style={styles.container}>
      <AppHeader
        user={currentUser}
        onBellPress={() => navigation.navigate('Notifications')}
        onAvatarPress={() => navigation.navigate('Profile')}
      />
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Your Library</Text>
          <Text style={styles.headerSubtitle}>Curating your personal journey through words and wisdom.</Text>
        </View>
        <TouchableOpacity style={styles.addBookBtn} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={18} color={colors.onPrimary} />
          <Text style={styles.addBookBtnText}>Add Book</Text>
        </TouchableOpacity>
      </View>

      {/* ── Status tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Search bar ── */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.outline} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your library…"
          placeholderTextColor={colors.outline}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={colors.outline} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="library-outline" size={64} color={colors.outlineVariant} />
          <Text style={styles.emptyText}>
            {searchQuery
              ? 'No books match your search'
              : books.length === 0
              ? 'Your library is empty'
              : 'No books in this shelf'}
          </Text>
          {books.length === 0 && (
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.emptyAddBtnText}>Add your first book</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id.toString()}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <BookTile
              userbook={item}
              onPress={() => navigation.navigate('BookDetail', { userbook: item, userbookId: item.id })}
            />
          )}
        />
      )}

      <AddBookModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={loadBooks}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.surface },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 12, paddingTop: 16 },
  headerTitle:  { ...type.headline, color: colors.onSurface },
  headerSubtitle: { ...type.bodySm, color: colors.onSurfaceVariant, marginTop: 3, paddingRight: 12 },
  addBookBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md },
  addBookBtnText: { ...type.label, color: colors.onPrimary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },

  searchBar:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 4, marginBottom: 10, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  searchInput:  { ...type.body, flex: 1, color: colors.onSurface },

  tabScroll:    {},
  tabContent:   { paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  tab:          { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.onSurfaceVariant + '60' },
  tabActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText:      { ...type.label, color: colors.onSurface },
  tabTextActive: { color: colors.onPrimary },

  grid:         { padding: GRID_PAD, gap: GRID_GAP },
  gridRow:      { gap: GRID_GAP, justifyContent: 'flex-start' },

  tile:         { marginBottom: 4 },
  tileInner:    { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  tileInfo:     { paddingTop: 10, paddingHorizontal: 2, gap: 3 },
  tileTitle:    { ...type.bodySm, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, lineHeight: 18 },
  tileAuthor:   { ...type.caption, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', lineHeight: 15 },
  tileStatus:   { fontFamily: 'Manrope_800ExtraBold', fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 0.6, marginTop: 2 },
  statusBadge:  { position: 'absolute', top: 8, right: 8, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  statusBadgeText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 9, fontWeight: '700', color: '#fff' },

  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  progressTrack: { flex: 1, height: 4, backgroundColor: colors.surfaceContainerHigh, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  progressLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 9, fontWeight: '700', color: colors.primary, width: 26 },

  emptyText:    { ...type.title, color: colors.onSurfaceVariant, marginTop: 14, textAlign: 'center' },
  emptyAddBtn:  { marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: radius.md },
  emptyAddBtnText: { ...type.label, color: colors.onPrimary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },

  // Modal
  modalRoot:    { flex: 1, backgroundColor: colors.surface },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '60' },
  modalCancel:  { ...type.body, color: colors.primary },
  modalTitle:   { ...type.title, fontFamily: 'NotoSerif_700Bold', color: colors.onSurface },

  searchRow:    { flexDirection: 'row', margin: 14, gap: 10 },
  searchBtn:    { width: 46, height: 46, backgroundColor: colors.primary, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },

  searchEmpty:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  searchEmptyText: { ...type.body, color: colors.onSurfaceVariant },

  // Search result cards
  resultsList:  { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  resultCard:   {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg, padding: 12, marginBottom: 12,
    ...shadow.card,
  },
  resultCoverWrap: { flexShrink: 0 },
  resultCover:  { width: 72, height: 108, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh },
  resultInfo:   { flex: 1 },
  resultTitle:  { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, marginBottom: 3 },
  resultAuthor: { ...type.label, color: colors.onSurfaceVariant, marginBottom: 2 },
  resultPublisher: { ...type.caption, color: colors.outline },

  // Options panel (after selecting a book)
  optionsScroll: { padding: 20, paddingTop: 12 },
  backBtn:      { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtnText:  { ...type.body, color: colors.primary, fontFamily: 'Manrope_600SemiBold', fontWeight: '600' },
  selectedHero: { flexDirection: 'row', gap: 16, marginBottom: 16, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, ...shadow.card },
  selectedCoverLarge: { width: 110, height: 165, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, flexShrink: 0 },
  selectedMeta: { flex: 1, justifyContent: 'flex-start', gap: 4 },
  selectedTitle: { ...type.title, fontFamily: 'NotoSerif_700Bold', color: colors.onSurface, marginBottom: 2 },
  selectedAuthor: { ...type.bodySm, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', color: colors.primary },
  selectedPublisher: { ...type.caption, color: colors.onSurfaceVariant },
  selectedPages: { ...type.caption, color: colors.outline, marginTop: 2 },
  descriptionBox: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, marginBottom: 4, ...shadow.card },
  descriptionText: { ...type.bodySm, color: colors.onSurfaceVariant },

  optionLabel:  { ...type.eyebrow, color: colors.onSurfaceVariant, marginTop: 18, marginBottom: 8 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest },
  chipActive:   { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText:     { ...type.bodySm, color: colors.onSurfaceVariant },
  chipTextActive: { color: colors.onPrimary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },

  addBtn:       { marginTop: 32, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center' },
  addBtnText:   { ...type.title, color: colors.onPrimary },
});
