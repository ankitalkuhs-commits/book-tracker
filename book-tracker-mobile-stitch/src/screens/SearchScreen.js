import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, Image,
  TouchableOpacity, ActivityIndicator, Alert, Modal,
  ScrollView, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { booksAPI } from '../services/api';
import { colors, radius, shadow, type } from '../theme';

// ── Genre chips ───────────────────────────────────────────────────────────────
const GENRES = [
  { key: 'all',       label: 'All' },
  { key: 'fiction',   label: 'Fiction' },
  { key: 'fantasy',   label: 'Fantasy' },
  { key: 'mystery',   label: 'Mystery' },
  { key: 'thriller',  label: 'Thriller' },
  { key: 'sci-fi',    label: 'Sci-Fi' },
  { key: 'romance',   label: 'Romance' },
  { key: 'historical',label: 'Historical' },
  { key: 'literary',  label: 'Literary' },
];

const SORT_OPTIONS = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'newest',    label: 'Newest' },
];

const STATUS_OPTIONS = [
  { value: 'to-read',  label: 'Want to Read' },
  { value: 'reading',  label: 'Reading' },
  { value: 'finished', label: 'Finished' },
];

const FORMAT_OPTIONS = [
  { value: 'hardcover',  label: 'Hardcover' },
  { value: 'paperback',  label: 'Paperback' },
  { value: 'ebook',      label: 'eBook' },
  { value: 'audiobook',  label: 'Audiobook' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractYear(published_date) {
  if (!published_date) return null;
  const m = published_date.match(/\d{4}/);
  return m ? m[0] : null;
}

function primaryCategory(categories) {
  if (!categories || categories.length === 0) return null;
  // Show the most specific segment (last part after /) of the first category
  const first = categories[0];
  const parts = first.split('/').map(p => p.trim());
  return parts[parts.length - 1];
}

function StarRow({ rating, count }) {
  if (!rating) return null;
  const stars = Math.round(rating);
  return (
    <View style={styles.starRow}>
      {[1,2,3,4,5].map(s => (
        <Ionicons key={s} name={s <= stars ? 'star' : 'star-outline'} size={10} color={colors.secondary} />
      ))}
      {count ? <Text style={styles.starCount}>{count >= 1000 ? `${(count/1000).toFixed(1)}k` : count}</Text> : null}
    </View>
  );
}

// ── Book card ─────────────────────────────────────────────────────────────────
function BookCard({ item, onAddPress }) {
  const [imgError, setImgError] = useState(false);
  const year = extractYear(item.published_date);
  const genre = primaryCategory(item.categories);

  return (
    <View style={styles.bookCard}>
      <View style={styles.coverWrap}>
        {item.cover_url && !imgError ? (
          <Image
            source={{ uri: item.cover_url }}
            style={styles.bookCover}
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={[styles.bookCover, styles.coverFallback]}>
            <Ionicons name="book-outline" size={28} color={colors.outline} />
          </View>
        )}
      </View>

      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title || 'Untitled'}</Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {item.authors?.join(', ') || 'Unknown Author'}
        </Text>

        {/* Meta row: genre badge + year */}
        <View style={styles.metaRow}>
          {genre ? (
            <View style={styles.genreBadge}>
              <Text style={styles.genreBadgeText}>{genre}</Text>
            </View>
          ) : null}
          {year ? <Text style={styles.yearText}>{year}</Text> : null}
          {item.total_pages > 0 ? (
            <Text style={styles.pagesText}>{item.total_pages} pp</Text>
          ) : null}
        </View>

        <StarRow rating={item.average_rating} count={item.ratings_count} />

        {item.description ? (
          <Text style={styles.bookDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => onAddPress(item)}
        >
          <Ionicons name="add" size={14} color={colors.onPrimary} />
          <Text style={styles.addButtonText}>Add to Library</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── OptionPills ───────────────────────────────────────────────────────────────
function OptionPills({ options, value, onChange }) {
  return (
    <View style={styles.optionGroup}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.optionButton, value === opt.value && styles.optionButtonActive]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[styles.optionText, value === opt.value && styles.optionTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef(null);

  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [hasSearched,    setHasSearched]    = useState(false);
  const [hasMore,        setHasMore]        = useState(false);
  const [nextStartIndex, setNextStartIndex] = useState(0);

  // Filters
  const [activeGenre,    setActiveGenre]    = useState('all');
  const [activeSort,     setActiveSort]     = useState('relevance');

  // Add modal
  const [selectedBook,       setSelectedBook]       = useState(null);
  const [showAddModal,       setShowAddModal]        = useState(false);
  const [bookStatus,         setBookStatus]          = useState('to-read');
  const [bookFormat,         setBookFormat]          = useState('paperback');
  const [addingBook,         setAddingBook]          = useState(false);

  const searchBooks = async (overrideGenre, overrideSort, append = false) => {
    if (!searchQuery.trim()) {
      Alert.alert('Enter a search term', 'Type a title, author name, or ISBN.');
      return;
    }
    Keyboard.dismiss();

    const genre   = overrideGenre ?? activeGenre;
    const orderBy = overrideSort  ?? activeSort;
    const startIndex = append ? nextStartIndex : 0;

    if (append) setLoadingMore(true);
    else { setSearching(true); setHasSearched(true); }

    try {
      const data = await booksAPI.search(searchQuery.trim(), { genre, orderBy, startIndex });
      const newResults = data.results || [];

      if (append) {
        // Deduplicate by google_id before appending
        setSearchResults(prev => {
          const seen = new Set(prev.map(r => r.google_id));
          return [...prev, ...newResults.filter(r => !seen.has(r.google_id))];
        });
      } else {
        setSearchResults(newResults);
      }

      setHasMore(data.has_more ?? false);
      setNextStartIndex(data.next_start_index ?? 0);
    } catch {
      Alert.alert('Search failed', 'Could not reach the book catalog. Try again.');
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  };

  const handleGenreChange = (g) => {
    setActiveGenre(g);
    if (hasSearched && searchQuery.trim()) searchBooks(g, activeSort);
  };

  const handleSortChange = (s) => {
    setActiveSort(s);
    if (hasSearched && searchQuery.trim()) searchBooks(activeGenre, s);
  };

  const openAddModal = (book) => {
    setSelectedBook(book);
    setBookStatus('to-read');
    setBookFormat('paperback');
    setShowAddModal(true);
  };

  const confirmAdd = async () => {
    if (!selectedBook) return;
    setAddingBook(true);
    try {
      await booksAPI.addToLibrary({
        title:          selectedBook.title,
        author:         selectedBook.authors?.join(', ') || 'Unknown Author',
        isbn:           selectedBook.isbn_13 || selectedBook.isbn_10,
        cover_url:      selectedBook.cover_url,
        description:    selectedBook.description,
        total_pages:    selectedBook.total_pages,
        publisher:      selectedBook.publisher,
        published_date: selectedBook.published_date,
        status:         bookStatus,
        current_page:   0,
        format:         bookFormat,
        ownership_status: 'owned',
      });
      setShowAddModal(false);
      setSelectedBook(null);
      Alert.alert('Added!', `"${selectedBook.title}" is now in your library.`, [
        { text: 'Keep Searching', style: 'cancel' },
        { text: 'Go to Library', onPress: () => navigation.navigate('Library') },
      ]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to add book. It may already be in your library.');
    } finally {
      setAddingBook(false);
    }
  };

  // ── Placeholder hint ───────────────────────────────────────────────────────
  const isISBNLike = /^\d[\d\-]{8,}$/.test(searchQuery.replace(/\s/g, ''));
  const placeholder = isISBNLike
    ? 'ISBN detected — tap Search'
    : 'Title, author, or ISBN…';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Search bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={18} color={colors.outline} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={placeholder}
            placeholderTextColor={colors.outline}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => searchBooks()}
            returnKeyType="search"
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setHasSearched(false); }}>
              <Ionicons name="close-circle" size={18} color={colors.outline} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.searchBtn, searching && { opacity: 0.6 }]}
          onPress={() => searchBooks()}
          disabled={searching}
        >
          {searching
            ? <ActivityIndicator size="small" color={colors.onPrimary} />
            : <Text style={styles.searchBtnText}>Search</Text>
          }
        </TouchableOpacity>
      </View>

      {/* ── Genre chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreRow}
        keyboardShouldPersistTaps="handled"
      >
        {GENRES.map(g => (
          <TouchableOpacity
            key={g.key}
            style={[styles.genreChip, activeGenre === g.key && styles.genreChipActive]}
            onPress={() => handleGenreChange(g.key)}
          >
            <Text style={[styles.genreChipText, activeGenre === g.key && styles.genreChipTextActive]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Sort toggle (only when results exist) ── */}
      {hasSearched && searchResults.length > 0 && (
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          {SORT_OPTIONS.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.sortBtn, activeSort === s.key && styles.sortBtnActive]}
              onPress={() => handleSortChange(s.key)}
            >
              <Text style={[styles.sortBtnText, activeSort === s.key && styles.sortBtnTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.resultCount}>{searchResults.length} results</Text>
        </View>
      )}

      {/* ── Results / states ── */}
      {searching ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Searching books…</Text>
        </View>
      ) : hasSearched && searchResults.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={52} color={colors.outlineVariant} />
          <Text style={styles.emptyTitle}>No books found</Text>
          <Text style={styles.emptySubtext}>
            Try a different title or author,{'\n'}or change the genre filter.
          </Text>
        </View>
      ) : !hasSearched ? (
        <View style={styles.centered}>
          <Ionicons name="library-outline" size={56} color={colors.outlineVariant} />
          <Text style={styles.emptyTitle}>Find your next read</Text>
          <Text style={styles.emptySubtext}>
            Search by title, author, or ISBN.{'\n'}Use the genre chips to narrow results.
          </Text>
        </View>
      ) : (
        <FlatList
          data={searchResults}
          renderItem={({ item }) => <BookCard item={item} onAddPress={openAddModal} />}
          keyExtractor={(item, i) => item?.google_id || `r-${i}`}
          contentContainerStyle={styles.resultsList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onEndReached={() => { if (hasMore && !loadingMore) searchBooks(undefined, undefined, true); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? (
            <View style={styles.loadMoreFooter}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadMoreText}>Loading more books…</Text>
            </View>
          ) : null}
        />
      )}

      {/* ── Add to Library Modal ── */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.sheetHandle} />

            {/* Book preview */}
            {selectedBook && (
              <View style={styles.modalBookRow}>
                {selectedBook.cover_url ? (
                  <Image source={{ uri: selectedBook.cover_url }} style={styles.modalCover} />
                ) : (
                  <View style={[styles.modalCover, styles.coverFallback]}>
                    <Ionicons name="book-outline" size={24} color={colors.outline} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalBookTitle} numberOfLines={2}>{selectedBook.title}</Text>
                  <Text style={styles.modalBookAuthor} numberOfLines={1}>
                    {selectedBook.authors?.join(', ') || 'Unknown Author'}
                  </Text>
                </View>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>ADD TO</Text>
              <OptionPills value={bookStatus} onChange={setBookStatus} options={STATUS_OPTIONS} />

              <Text style={styles.fieldLabel}>FORMAT</Text>
              <OptionPills value={bookFormat} onChange={setBookFormat} options={FORMAT_OPTIONS} />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowAddModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, addingBook && { opacity: 0.6 }]}
                  onPress={confirmAdd}
                  disabled={addingBook}
                >
                  {addingBook
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Text style={styles.confirmBtnText}>Add Book</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  // ── Top bar ──
  topBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backBtn:    { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  inputWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLow, borderRadius: radius.lg, paddingHorizontal: 12, height: 44, gap: 8, borderWidth: 1, borderColor: colors.outlineVariant + '50' },
  searchIcon: { flexShrink: 0 },
  searchInput:{ flex: 1, ...type.body, color: colors.onSurface, padding: 0, textAlignVertical: 'center' },
  searchBtn:  { backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: 16, height: 44, justifyContent: 'center' },
  searchBtnText: { ...type.label, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },

  // ── Genre chips ──
  genreRow:   { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  genreChip:  { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.outlineVariant + '80', backgroundColor: colors.surfaceContainerLowest },
  genreChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  genreChipText:     { ...type.label, color: colors.onSurfaceVariant },
  genreChipTextActive: { color: colors.onPrimary, fontWeight: '700' },

  // ── Sort row ──
  sortRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  sortLabel:  { ...type.caption, color: colors.onSurfaceVariant },
  sortBtn:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  sortBtnActive: { backgroundColor: colors.primaryContainer },
  sortBtnText:   { ...type.caption, color: colors.onSurfaceVariant },
  sortBtnTextActive: { color: colors.onPrimary, fontWeight: '700' },
  resultCount:{ ...type.caption, color: colors.outline, marginLeft: 'auto' },

  // ── States ──
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  loadingText:  { ...type.body, color: colors.onSurfaceVariant, marginTop: 8 },
  emptyTitle:   { ...type.titleLg, color: colors.onSurface, textAlign: 'center' },
  emptySubtext: { ...type.body, color: colors.onSurfaceVariant, textAlign: 'center' },

  // ── Results ──
  resultsList: { padding: 12, gap: 10 },

  // ── Book card ──
  bookCard:     { flexDirection: 'row', backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, gap: 12, ...shadow.card },
  coverWrap:    { flexShrink: 0 },
  bookCover:    { width: 76, height: 114, borderRadius: radius.md },
  coverFallback:{ backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' },
  bookInfo:     { flex: 1, gap: 4 },
  bookTitle:    { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, lineHeight: 20 },
  bookAuthor:   { ...type.bodySm, color: colors.onSurfaceVariant },
  metaRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  genreBadge:   { backgroundColor: colors.primary + '14', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  genreBadgeText: { ...type.caption, color: colors.primary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  yearText:     { ...type.caption, color: colors.outline },
  pagesText:    { ...type.caption, color: colors.outline },
  starRow:      { flexDirection: 'row', alignItems: 'center', gap: 2 },
  starCount:    { ...type.caption, color: colors.outline, marginLeft: 4 },
  bookDesc:     { ...type.caption, color: colors.onSurfaceVariant, lineHeight: 16 },
  addButton:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: colors.primary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.md, marginTop: 4 },
  addButtonText:{ ...type.label, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },

  // ── Load more footer ──
  loadMoreFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  loadMoreText:   { ...type.bodySm, color: colors.onSurfaceVariant },

  // ── Add modal ──
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:     { backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12, maxHeight: '80%' },
  sheetHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outlineVariant, alignSelf: 'center', marginBottom: 16 },
  modalBookRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, padding: 12, marginBottom: 20 },
  modalCover:     { width: 56, height: 84, borderRadius: radius.sm },
  modalBookTitle: { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
  modalBookAuthor:{ ...type.bodySm, color: colors.onSurfaceVariant },
  fieldLabel:     { ...type.eyebrow, color: colors.onSurfaceVariant, marginBottom: 10, marginTop: 16 },
  optionGroup:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionButton:   { paddingVertical: 7, paddingHorizontal: 16, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.outlineVariant + '80', backgroundColor: colors.surfaceContainerLowest },
  optionButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText:     { ...type.label, color: colors.onSurfaceVariant },
  optionTextActive: { color: colors.onPrimary, fontWeight: '700' },
  modalBtns:      { flexDirection: 'row', gap: 12, marginTop: 28 },
  cancelBtn:      { flex: 1, paddingVertical: 13, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.outlineVariant, alignItems: 'center' },
  cancelBtnText:  { ...type.label, fontWeight: '600', color: colors.onSurfaceVariant },
  confirmBtn:     { flex: 1, paddingVertical: 13, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  confirmBtnText: { ...type.label, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },
});
