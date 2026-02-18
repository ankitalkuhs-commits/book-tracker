// Library Screen - Shows user's books
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { userbooksAPI, authAPI } from '../services/api';
import { PreloadContext } from '../../App';

export default function LibraryScreen({ navigation, onLogout }) {
  const preloaded = useContext(PreloadContext);
  const [books, setBooks] = useState(preloaded?.library || []);
  const [loading, setLoading] = useState(!preloaded?.library);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadBooks = async () => {
    try {
      const data = await userbooksAPI.getMyBooks();
      setBooks(data);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Only load if not already preloaded
    if (!preloaded?.library) {
      loadBooks();
    }
    
    // Reload books when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      loadBooks();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    loadBooks();
  };

  // Filter books based on active tab and search query
  const getFilteredBooks = () => {
    let filtered = books;
    
    // Filter by tab
    if (activeTab !== 'all') {
      filtered = filtered.filter(book => {
        if (activeTab === 'reading') return book.status === 'reading';
        if (activeTab === 'to-read') return book.status === 'to-read';
        if (activeTab === 'finished') return book.status === 'finished';
        return true;
      });
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(book => {
        const title = (book.book?.title || '').toLowerCase();
        const author = (book.book?.author || '').toLowerCase();
        return title.includes(query) || author.includes(query);
      });
    }
    
    return filtered;
  };

  const renderBook = ({ item }) => (
    <TouchableOpacity 
      style={styles.bookCard}
      onPress={() => navigation.navigate('BookDetail', { userbook: item, userbookId: item.id })}
    >
      <Image
        source={{ uri: item.book?.cover_url || 'https://via.placeholder.com/100x150' }}
        style={styles.bookCover}
      />
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.book?.title || 'Untitled'}
        </Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {item.book?.author || 'Unknown Author'}
        </Text>
        {item.status && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {item.status === 'to-read' ? '📚 To Read' : item.status === 'reading' ? '📖 Reading' : '✅ Finished'}
            </Text>
          </View>
        )}
        {item.book?.total_pages ? (
          <Text style={styles.progress}>
            {item.status === 'reading' && item.current_page 
              ? `Page ${item.current_page} of ${item.book.total_pages}`
              : item.status === 'finished'
              ? `${item.book.total_pages} pages • Completed`
              : `${item.book.total_pages} pages`}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.header}>My Library</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => navigation.navigate('Search')}
        >
          <Text style={styles.addButtonText}>+ Add Book</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'reading' && styles.activeTab]}
          onPress={() => setActiveTab('reading')}
        >
          <Text style={[styles.tabText, activeTab === 'reading' && styles.activeTabText]}>
            Reading
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'to-read' && styles.activeTab]}
          onPress={() => setActiveTab('to-read')}
        >
          <Text style={[styles.tabText, activeTab === 'to-read' && styles.activeTabText]}>
            Want to Read
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'finished' && styles.activeTab]}
          onPress={() => setActiveTab('finished')}
        >
          <Text style={[styles.tabText, activeTab === 'finished' && styles.activeTabText]}>
            Finished
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search in library"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {getFilteredBooks().length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyText}>
            {searchQuery ? 'No books found' : books.length === 0 ? 'No books yet' : 'No books in this category'}
          </Text>
          <Text style={styles.emptySubtext}>
            {books.length === 0 ? 'Add your first book to get started!' : 'Try a different filter or search'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={getFilteredBooks()}
          renderItem={renderBook}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  header: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#4285F4',
  },
  tabText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#4285F4',
    fontWeight: '700',
  },
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchHeader: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4285F4',
  },
  list: {
    padding: 16,
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
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
  bookInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#555',
  },
  progress: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
});
