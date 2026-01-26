// Library Screen - Shows user's books
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { userbooksAPI } from '../services/api';

export default function LibraryScreen() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    loadBooks();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadBooks();
  };

  const renderBook = ({ item }) => (
    <TouchableOpacity style={styles.bookCard}>
      <Image
        source={{ uri: item.book?.cover_url || 'https://via.placeholder.com/100x150' }}
        style={styles.bookCover}
      />
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.book?.title}
        </Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {item.book?.author}
        </Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
            {item.status === 'to-read' && '📚 To Read'}
            {item.status === 'reading' && '📖 Reading'}
            {item.status === 'finished' && '✅ Finished'}
          </Text>
        </View>
        {item.status === 'reading' && item.current_page && (
          <Text style={styles.progress}>
            Page {item.current_page} of {item.book?.total_pages || '?'}
          </Text>
        )}
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
      <Text style={styles.header}>My Library</Text>
      {books.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyText}>No books yet</Text>
          <Text style={styles.emptySubtext}>Add your first book to get started!</Text>
        </View>
      ) : (
        <FlatList
          data={books}
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
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
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
