import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { userAPI, userbooksAPI } from '../services/api';
import ReadingActivityChart from '../components/ReadingActivityChart';

export default function UserProfileScreen({ route, navigation }) {
  const { userId, userName } = route.params;
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState(null);
  const [currentlyReading, setCurrentlyReading] = useState([]);
  const [lastCompleted, setLastCompleted] = useState(null);

  useEffect(() => {
    loadUserProfile();
  }, [userId]);

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      console.log('Loading profile for userId:', userId);
      const [stats, books] = await Promise.all([
        userAPI.getUserStats(userId),
        userbooksAPI.getUserBooks(userId)
      ]);

      console.log('User stats:', stats);
      console.log('User books:', books);
      setUserStats(stats);

      // Filter currently reading books
      const reading = books.filter(b => b.status === 'reading');
      setCurrentlyReading(reading);

      // Find last completed book (most recent finished)
      const completed = books
        .filter(b => b.status === 'finished')
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      setLastCompleted(completed[0] || null);
    } catch (error) {
      console.error('Failed to load user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderBookCover = (book) => {
    const coverUrl = book?.book?.cover_url || 'https://via.placeholder.com/60x90?text=No+Cover';
    const title = book?.book?.title || 'Unknown';
    
    return (
      <View style={styles.bookItem} key={book.id}>
        <Image source={{ uri: coverUrl }} style={styles.bookCover} />
        <Text style={styles.bookTitle} numberOfLines={2}>{title}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (!userStats) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load profile</Text>
      </View>
    );
  }

  const initials = (userName || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{userName || 'User'}</Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{userStats.total_books || 0}</Text>
          <Text style={styles.statLabel}>Total Books</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{userStats.finished || 0}</Text>
          <Text style={styles.statLabel}>Finished</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{userStats.reading || 0}</Text>
          <Text style={styles.statLabel}>Reading</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{userStats.to_read || 0}</Text>
          <Text style={styles.statLabel}>To Read</Text>
        </View>
      </View>

      {/* Reading Activity Chart */}
      <ReadingActivityChart userId={userId} />

      {/* Reading Activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reading Activity</Text>
        <View style={styles.activityCard}>
          <View style={styles.activityRow}>
            <Text style={styles.activityLabel}>Last Month</Text>
            <Text style={styles.activityValue}>{userStats.last_month || 0} books</Text>
          </View>
          <View style={styles.activityRow}>
            <Text style={styles.activityLabel}>This Year</Text>
            <Text style={styles.activityValue}>{userStats.this_year || 0} books</Text>
          </View>
          <View style={styles.activityRow}>
            <Text style={styles.activityLabel}>Total Pages</Text>
            <Text style={styles.activityValue}>
              {userStats.total_pages?.toLocaleString() || 0}
            </Text>
          </View>
        </View>
      </View>

      {/* Currently Reading */}
      {currentlyReading.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Currently Reading</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.booksRow}
          >
            {currentlyReading.map(book => renderBookCover(book))}
          </ScrollView>
        </View>
      )}

      {/* Last Completed */}
      {lastCompleted && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last Completed</Text>
          <View style={styles.lastBookCard}>
            <Image 
              source={{ uri: lastCompleted.book?.cover_url || 'https://via.placeholder.com/80x120' }}
              style={styles.lastBookCover}
            />
            <View style={styles.lastBookInfo}>
              <Text style={styles.lastBookTitle} numberOfLines={2}>
                {lastCompleted.book?.title || 'Unknown'}
              </Text>
              <Text style={styles.lastBookAuthor} numberOfLines={1}>
                {lastCompleted.book?.author || 'Unknown Author'}
              </Text>
              <Text style={styles.lastBookDate}>
                Completed {new Date(lastCompleted.updated_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#667eea',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  section: {
    marginTop: 8,
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  activityCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  activityLabel: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  activityValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  booksRow: {
    paddingVertical: 8,
  },
  bookItem: {
    marginRight: 16,
    width: 100,
  },
  bookCover: {
    width: 100,
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
  },
  bookTitle: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  lastBookCard: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
  },
  lastBookCover: {
    width: 80,
    height: 120,
    borderRadius: 8,
    marginRight: 16,
  },
  lastBookInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  lastBookTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  lastBookAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  lastBookDate: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '500',
  },
});
