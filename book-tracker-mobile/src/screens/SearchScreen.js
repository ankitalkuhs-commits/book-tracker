// Search & Add Books Screen
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { booksAPI, userbooksAPI } from '../services/api';

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
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter a search term');
      return;
    }

    setSearching(true);
    try {
      const results = await booksAPI.search(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('No Results', 'No books found. Try a different search.');
      }
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search books');
    } finally {
      setSearching(false);
    }
  };

  const addBookToLibrary = async (book) => {
    setAddingBookId(book.google_id);
    try {
      // Add book to library with selected options
      await booksAPI.addToLibrary({
        title: book.title,
        author: book.authors?.join(', ') || 'Unknown Author',
        isbn: book.isbn_13 || book.isbn_10,
        cover_url: book.cover_url,
        description: book.description,
        total_pages: book.total_pages,
        publisher: book.publisher,
        published_date: book.published_date,
        status: bookStatus,
        current_page: 0,
        format: bookFormat,
        ownership_status: ownershipStatus,
      });
      
      Alert.alert('Success', `"${book.title}" added to your library!`);
      
      // Reset modal state
      setShowAddModal(false);
      setSelectedBook(null);
      setBookStatus('to-read');
      setBookFormat('hardcover');
      setOwnershipStatus('owned');
      
      // Navigate back to library (which will auto-refresh)
      navigation.goBack();
    } catch (error) {
      console.error('Add book error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add book. It might already be in your library.');
    } finally {
      setAddingBookId(null);
    }
  };

  const renderBook = ({ item }) => (
    <View style={styles.bookCard}>
      <Image
        source={{ uri: item.cover_url || 'https://via.placeholder.com/80x120' }}
        style={styles.bookCover}
      />
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {item.authors?.join(', ') || 'Unknown Author'}
        </Text>
        {item.total_pages && (
          <Text style={styles.bookPages}>{item.total_pages} pages</Text>
        )}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setSelectedBook(item);
            setShowAddModal(true);
          }}
          disabled={addingBookId === item.google_id}
        >
          {addingBookId === item.google_id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.addButtonText}>+ Add to Library</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search Books</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search books"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={searchBooks}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={searchBooks}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.searchButtonText}>🔍</Text>
          )}
        </TouchableOpacity>
      </View>

      {searching && searchResults.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : searchResults.length > 0 ? (
        <FlatList
          data={searchResults}
          renderItem={renderBook}
          keyExtractor={(item) => item.google_id || Math.random().toString()}
          contentContainerStyle={styles.results}
        />
      ) : (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyText}>Search for books to add to your library</Text>
          <Text style={styles.emptySubtext}>
            Try searching for your favorite title or author
          </Text>
        </View>
      )}

      {/* Add Book Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add Book to Library</Text>
              
              {selectedBook && (
                <View style={styles.selectedBookInfo}>
                  <Image
                    source={{ uri: selectedBook.cover_url || 'https://via.placeholder.com/60x90' }}
                    style={styles.modalBookCover}
                  />
                  <View style={styles.modalBookDetails}>
                    <Text style={styles.modalBookTitle} numberOfLines={2}>
                      {selectedBook.title}
                    </Text>
                    <Text style={styles.modalBookAuthor} numberOfLines={1}>
                      {selectedBook.authors?.join(', ') || 'Unknown Author'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Status Selection */}
              <Text style={styles.sectionLabel}>Add to:</Text>
              <View style={styles.optionGroup}>
                <TouchableOpacity
                  style={[styles.optionButton, bookStatus === 'to-read' && styles.optionButtonActive]}
                  onPress={() => setBookStatus('to-read')}
                >
                  <Text style={[styles.optionText, bookStatus === 'to-read' && styles.optionTextActive]}>
                    Want to Read
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, bookStatus === 'reading' && styles.optionButtonActive]}
                  onPress={() => setBookStatus('reading')}
                >
                  <Text style={[styles.optionText, bookStatus === 'reading' && styles.optionTextActive]}>
                    Reading
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, bookStatus === 'finished' && styles.optionButtonActive]}
                  onPress={() => setBookStatus('finished')}
                >
                  <Text style={[styles.optionText, bookStatus === 'finished' && styles.optionTextActive]}>
                    Finished
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Format Selection */}
              <Text style={styles.sectionLabel}>Format:</Text>
              <View style={styles.optionGroup}>
                <TouchableOpacity
                  style={[styles.optionButton, bookFormat === 'hardcover' && styles.optionButtonActive]}
                  onPress={() => setBookFormat('hardcover')}
                >
                  <Text style={[styles.optionText, bookFormat === 'hardcover' && styles.optionTextActive]}>
                    Hardcover
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, bookFormat === 'paperback' && styles.optionButtonActive]}
                  onPress={() => setBookFormat('paperback')}
                >
                  <Text style={[styles.optionText, bookFormat === 'paperback' && styles.optionTextActive]}>
                    Paperback
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, bookFormat === 'ebook' && styles.optionButtonActive]}
                  onPress={() => setBookFormat('ebook')}
                >
                  <Text style={[styles.optionText, bookFormat === 'ebook' && styles.optionTextActive]}>
                    eBook
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, bookFormat === 'kindle' && styles.optionButtonActive]}
                  onPress={() => setBookFormat('kindle')}
                >
                  <Text style={[styles.optionText, bookFormat === 'kindle' && styles.optionTextActive]}>
                    Kindle
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, bookFormat === 'audiobook' && styles.optionButtonActive]}
                  onPress={() => setBookFormat('audiobook')}
                >
                  <Text style={[styles.optionText, bookFormat === 'audiobook' && styles.optionTextActive]}>
                    Audiobook
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Ownership Selection */}
              <Text style={styles.sectionLabel}>Ownership:</Text>
              <View style={styles.optionGroup}>
                <TouchableOpacity
                  style={[styles.optionButton, ownershipStatus === 'owned' && styles.optionButtonActive]}
                  onPress={() => setOwnershipStatus('owned')}
                >
                  <Text style={[styles.optionText, ownershipStatus === 'owned' && styles.optionTextActive]}>
                    Owned
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, ownershipStatus === 'borrowed' && styles.optionButtonActive]}
                  onPress={() => setOwnershipStatus('borrowed')}
                >
                  <Text style={[styles.optionText, ownershipStatus === 'borrowed' && styles.optionTextActive]}>
                    Borrowed
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, ownershipStatus === 'loaned' && styles.optionButtonActive]}
                  onPress={() => setOwnershipStatus('loaned')}
                >
                  <Text style={[styles.optionText, ownershipStatus === 'loaned' && styles.optionTextActive]}>
                    Loaned
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddModal(false);
                    setSelectedBook(null);
                    setBookStatus('to-read');
                    setBookFormat('hardcover');
                    setOwnershipStatus('owned');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => addBookToLibrary(selectedBook)}
                  disabled={!!addingBookId}
                >
                  {addingBookId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmButtonText}>Add Book</Text>
                  )}
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
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 45,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    color: '#333',
  },
  searchButton: {
    width: 45,
    height: 45,
    backgroundColor: '#4285F4',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    fontSize: 20,
  },
  results: {
    padding: 15,
  },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  bookCover: {
    width: 80,
    height: 120,
    borderRadius: 6,
  },
  bookInfo: {
    flex: 1,
    marginLeft: 12,
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  bookPages: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  addButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
    alignSelf: 'flex-start',
    minWidth: 120,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 15,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  selectedBookInfo: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  modalBookCover: {
    width: 60,
    height: 90,
    borderRadius: 4,
  },
  modalBookDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  modalBookTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalBookAuthor: {
    fontSize: 14,
    color: '#666',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 10,
    color: '#333',
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 5,
  },
  optionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  optionButtonActive: {
    backgroundColor: '#4285F4',
    borderColor: '#4285F4',
  },
  optionText: {
    fontSize: 14,
    color: '#666',
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 30,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#4285F4',
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },});