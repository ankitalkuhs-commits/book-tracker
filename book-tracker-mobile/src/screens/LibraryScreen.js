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
import { colors, radius, shadow } from '../theme';

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
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[item.status]?.bg || colors.surfaceContainerHigh }]}>
            <Text style={[styles.statusText, { color: STATUS_COLOR[item.status]?.text || colors.onSurfaceVariant }]}>
              {item.status === 'to-read' ? 'Want to Read' : item.status === 'reading' ? 'Reading' : 'Finished'}
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
        {[
          { key: 'all', label: 'All', count: books.length },
          { key: 'reading', label: 'Reading', count: books.filter(b => b.status === 'reading').length },
          { key: 'to-read', label: 'Want to Read', count: books.filter(b => b.status === 'to-read').length },
          { key: 'finished', label: 'Finished', count: books.filter(b => b.status === 'finished').length },
        ].map(({ key, label, count }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.activeTab]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabText, activeTab === key && styles.activeTabText]}>
              {label}
            </Text>
            <Text style={[styles.tabCount, activeTab === key && styles.activeTabText]}>
              {count}
            </Text>
          </TouchableOpacity>
        ))}
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
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        )}
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

const STATUS_COLOR = {
  'reading':  { bg: colors.primary + '15',   text: colors.primary },
  'to-read':  { bg: colors.tertiary + '15',  text: colors.tertiary },
  'finished': { bg: colors.secondary + '15', text: colors.secondary },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
    backgroundColor: colors.surface,
  },
  header: { fontSize: 28, fontWeight: '800', color: colors.primary },
  addButton: {
    backgroundColor: colors.primary, paddingHorizontal: 16,
    paddingVertical: 8, borderRadius: radius.md,
  },
  addButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.surface,
    paddingHorizontal: 16, paddingBottom: 10, gap: 6,
  },
  tab: {
    paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center',
    borderRadius: 999, backgroundColor: colors.surfaceContainerHigh,
  },
  activeTab: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, color: colors.onSurfaceVariant, fontWeight: '600' },
  tabCount: { fontSize: 11, color: colors.outline, marginTop: 1 },
  activeTabText: { color: colors.onPrimary, fontWeight: '700' },
  searchContainer: {
    backgroundColor: colors.surface, paddingHorizontal: 16, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  searchInput: {
    flex: 1, backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.lg,
    fontSize: 14, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.outlineVariant + '60',
  },
  clearButton: { paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  clearButtonText: { fontSize: 18, color: colors.outline },
  searchHeader: {
    backgroundColor: colors.surface, paddingTop: 50, paddingBottom: 14,
    paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '40',
  },
  backButton: { padding: 5 },
  backButtonText: { fontSize: 16, color: colors.primary },
  list: { padding: 14 },
  bookCard: {
    flexDirection: 'row', backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg, padding: 14, marginBottom: 10, ...shadow.card,
  },
  bookCover: { width: 80, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh },
  bookInfo: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  bookTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginBottom: 3 },
  bookAuthor: { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 8 },
  statusBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, marginBottom: 4,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  progress: { fontSize: 11, color: colors.outline, marginTop: 4 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: colors.onSurfaceVariant },
});
