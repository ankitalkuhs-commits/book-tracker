import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Image, TouchableOpacity, ActivityIndicator, Alert, Modal, ScrollView } from 'react-native';
import { booksAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

export default function SearchScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingBookId, setAddingBookId] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [bookStatus, setBookStatus] = useState('to-read');
  const [bookFormat, setBookFormat] = useState('hardcover');
  const [ownershipStatus, setOwnershipStatus] = useState('owned');

  const searchBooks = async () => {
    if (!searchQuery.trim()) { Alert.alert('Error', 'Please enter a search term'); return; }
    setSearching(true);
    try {
      const results = await booksAPI.search(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) Alert.alert('No Results', 'No books found. Try a different search.');
    } catch { Alert.alert('Error', 'Failed to search books'); }
    finally { setSearching(false); }
  };

  const addBookToLibrary = async (book) => {
    setAddingBookId(book.google_id);
    try {
      await booksAPI.addToLibrary({
        title: book.title, author: book.authors?.join(', ') || 'Unknown Author',
        isbn: book.isbn_13 || book.isbn_10, cover_url: book.cover_url,
        description: book.description, total_pages: book.total_pages,
        publisher: book.publisher, published_date: book.published_date,
        status: bookStatus, current_page: 0, format: bookFormat, ownership_status: ownershipStatus,
      });
      Alert.alert('Success', `"${book.title}" added to your library!`);
      setShowAddModal(false); setSelectedBook(null);
      setBookStatus('to-read'); setBookFormat('hardcover'); setOwnershipStatus('owned');
      navigation.goBack();
    } catch (error) { Alert.alert('Error', error.response?.data?.detail || 'Failed to add book. It might already be in your library.'); }
    finally { setAddingBookId(null); }
  };

  const renderBook = ({ item }) => {
    if (!item) return null;
    return (
      <View style={styles.bookCard}>
        <Image source={{ uri: item.cover_url || 'https://via.placeholder.com/80x120' }} style={styles.bookCover} />
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2} lineBreakMode="tail">{item.title || 'Untitled'}</Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>{item.authors?.join(', ') || 'Unknown Author'}</Text>
          {item.total_pages > 0 && <Text style={styles.bookPages}>{item.total_pages} pages</Text>}
          <TouchableOpacity style={styles.addButton} onPress={() => { setSelectedBook(item); setShowAddModal(true); }} disabled={addingBookId === item.google_id}>
            {addingBookId === item.google_id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addButtonText}>+ Add to Library</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const OptionPills = ({ options, value, onChange }) => (
    <View style={styles.optionGroup}>
      {options.map(opt => (
        <TouchableOpacity key={opt.value} style={[styles.optionButton, value === opt.value && styles.optionButtonActive]} onPress={() => onChange(opt.value)}>
          <Text style={[styles.optionText, value === opt.value && styles.optionTextActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput style={styles.searchInput} placeholder="Search books" placeholderTextColor="#999" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={searchBooks} returnKeyType="search" />
        <TouchableOpacity style={styles.searchButton} onPress={searchBooks} disabled={searching}>
          {searching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.searchButtonText}>🔍</Text>}
        </TouchableOpacity>
      </View>

      {searching && searchResults.length === 0 ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Searching...</Text></View>
      ) : searchResults.length > 0 ? (
        <FlatList data={searchResults.filter(i => i != null)} renderItem={renderBook} keyExtractor={(item, index) => item?.google_id || `search-${index}`} contentContainerStyle={styles.results} />
      ) : (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyText}>Search for books to add to your library</Text>
          <Text style={styles.emptySubtext}>Try searching for your favorite title or author</Text>
        </View>
      )}

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add Book to Library</Text>
              {selectedBook && (
                <View style={styles.selectedBookInfo}>
                  <Image source={{ uri: selectedBook.cover_url || 'https://via.placeholder.com/60x90' }} style={styles.modalBookCover} />
                  <View style={styles.modalBookDetails}>
                    <Text style={styles.modalBookTitle} numberOfLines={2}>{selectedBook.title}</Text>
                    <Text style={styles.modalBookAuthor} numberOfLines={1}>{selectedBook.authors?.join(', ') || 'Unknown Author'}</Text>
                  </View>
                </View>
              )}
              <Text style={styles.sectionLabel}>Add to:</Text>
              <OptionPills value={bookStatus} onChange={setBookStatus} options={[{ value: 'to-read', label: 'Want to Read' }, { value: 'reading', label: 'Reading' }, { value: 'finished', label: 'Finished' }]} />
              <Text style={styles.sectionLabel}>Format:</Text>
              <OptionPills value={bookFormat} onChange={setBookFormat} options={[{ value: 'hardcover', label: 'Hardcover' }, { value: 'paperback', label: 'Paperback' }, { value: 'ebook', label: 'eBook' }, { value: 'audiobook', label: 'Audiobook' }]} />
              <Text style={styles.sectionLabel}>Ownership:</Text>
              <OptionPills value={ownershipStatus} onChange={setOwnershipStatus} options={[{ value: 'owned', label: 'Owned' }, { value: 'borrowed', label: 'Borrowed' }, { value: 'loaned', label: 'Loaned' }]} />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowAddModal(false); setSelectedBook(null); setBookStatus('to-read'); setBookFormat('hardcover'); setOwnershipStatus('owned'); }}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={() => addBookToLibrary(selectedBook)} disabled={!!addingBookId}>
                  {addingBookId ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmButtonText}>Add Book</Text>}
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
  searchContainer: { flexDirection: 'row', padding: 14, backgroundColor: colors.surface, gap: 10 },
  searchInput: { flex: 1, height: 46, borderWidth: 1, borderColor: colors.outlineVariant + '60', borderRadius: radius.lg, paddingHorizontal: 16, fontSize: 15, backgroundColor: colors.surfaceContainerLow, color: colors.onSurface },
  searchButton: { width: 46, height: 46, backgroundColor: colors.primary, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center' },
  searchButtonText: { fontSize: 20 },
  results: { padding: 14 },
  bookCard: { flexDirection: 'row', backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, marginBottom: 10, ...shadow.card },
  bookCover: { width: 80, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh },
  bookInfo: { flex: 1, marginLeft: 14 },
  bookTitle: { fontSize: 15, fontWeight: '700', lineHeight: 22, color: colors.onSurface, marginBottom: 4 },
  bookAuthor: { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 4 },
  bookPages: { fontSize: 12, color: colors.outline, marginBottom: 10 },
  addButton: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, alignSelf: 'flex-start', minWidth: 120, alignItems: 'center' },
  addButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 15, color: colors.onSurfaceVariant },
  emptyIcon: { fontSize: 64, marginBottom: 14 },
  emptyText: { fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 8, textAlign: 'center' },
  emptySubtext: { fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: 18, textAlign: 'center' },
  selectedBookInfo: { flexDirection: 'row', backgroundColor: colors.surfaceContainerLow, padding: 12, borderRadius: radius.md, marginBottom: 18 },
  modalBookCover: { width: 60, height: 90, borderRadius: radius.md },
  modalBookDetails: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  modalBookTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
  modalBookAuthor: { fontSize: 13, color: colors.onSurfaceVariant },
  sectionLabel: { fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 8, color: colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.8 },
  optionGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  optionButton: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest },
  optionButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: 13, color: colors.onSurfaceVariant },
  optionTextActive: { color: colors.onPrimary, fontWeight: '700' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 28 },
  cancelButton: { flex: 1, paddingVertical: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outlineVariant, alignItems: 'center' },
  cancelButtonText: { fontSize: 15, color: colors.onSurfaceVariant, fontWeight: '600' },
  confirmButton: { flex: 1, paddingVertical: 13, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  confirmButtonText: { fontSize: 15, color: colors.onPrimary, fontWeight: '700' },
});
