import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { userAPI, authAPI, userbooksAPI } from '../services/api';
import { PreloadContext } from '../../App';

const ProfileScreen = ({ onLogout }) => {
  const preloaded = useContext(PreloadContext);
  const [profile, setProfile] = useState(preloaded?.profile || null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(!preloaded?.profile);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (preloaded?.profile && preloaded?.library) {
      // Calculate stats from preloaded library data
      calculateStats(preloaded.library, preloaded.profile?.stats);
      setLoading(false);
    } else {
      loadProfile();
    }
  }, []);

  const calculateStats = (booksData, profileStats = null) => {
    const totalBooks = booksData.length;
    const reading = booksData.filter(b => b.status === 'reading').length;
    const finished = booksData.filter(b => b.status === 'finished').length;
    const toRead = booksData.filter(b => b.status === 'to-read').length;
    
    // Use backend stats if available (more accurate), fallback to client-side calculation
    let totalPagesRead = profileStats?.total_pages_read;
    if (totalPagesRead === undefined || totalPagesRead === null) {
      totalPagesRead = booksData.reduce((sum, b) => {
        if (b.status === 'finished') {
          return sum + (b.book?.total_pages || b.current_page || 0);
        } else if (b.status === 'reading') {
          return sum + (b.current_page || 0);
        }
        return sum;
      }, 0);
    }
    
    setStats({
      totalBooks,
      reading,
      finished,
      toRead,
      totalPagesRead,
    });
  };

  const loadProfile = async () => {
    try {
      setLoading(true);
      const [profileData, booksData] = await Promise.all([
        userAPI.getProfile(),
        userbooksAPI.getMyBooks(),
      ]);

      setProfile(profileData);
      calculateStats(booksData, profileData?.stats);
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await authAPI.logout();
            if (onLogout) onLogout();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutButton}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* User Info Card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.userName}>
            {profile?.name || profile?.email || 'User'}
          </Text>
          <Text style={styles.userEmail}>{profile?.email}</Text>
          {profile?.created_at && (
            <Text style={styles.memberSince}>
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </Text>
          )}
        </View>

        {/* Reading Stats */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📊 Reading Statistics</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalBooks || 0}</Text>
            <Text style={styles.statLabel}>Total Books</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.finished || 0}</Text>
            <Text style={styles.statLabel}>Finished</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#f59e0b' }]}>
              {stats?.reading || 0}
            </Text>
            <Text style={styles.statLabel}>Reading</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#8b5cf6' }]}>
              {stats?.toRead || 0}
            </Text>
            <Text style={styles.statLabel}>To Read</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardFull]}>
            <Text style={[styles.statValue, { color: '#10b981' }]}>
              {stats?.totalPagesRead?.toLocaleString() || 0}
            </Text>
            <Text style={styles.statLabel}>Total Pages Read</Text>
          </View>
        </View>

        {/* This Year Stats */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📅 {currentYear} Reading</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.yearStat}>
            <Text style={styles.yearStatLabel}>Books Read This Year</Text>
            <Text style={styles.yearStatValue}>{stats?.finished || 0}</Text>
          </View>
          <View style={styles.yearStat}>
            <Text style={styles.yearStatLabel}>Currently Reading</Text>
            <Text style={styles.yearStatValue}>{stats?.reading || 0}</Text>
          </View>
          <View style={styles.yearStat}>
            <Text style={styles.yearStatLabel}>Reading Goal Progress</Text>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${Math.min(
                      ((stats?.finished || 0) / 12) * 100,
                      100
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {stats?.finished || 0} / 12 books
            </Text>
          </View>
        </View>

        {/* About */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ℹ️ About</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.aboutText}>
            Track My Read helps you track your reading journey, share your
            thoughts, and connect with fellow readers.
          </Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
};

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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  logoutButton: {
    fontSize: 16,
    color: '#0066cc',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  memberSince: {
    fontSize: 12,
    color: '#999',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 4,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  statCardFull: {
    flex: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0066cc',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  yearStat: {
    width: '100%',
    marginBottom: 16,
  },
  yearStatLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  yearStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0066cc',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  aboutText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  versionText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});

export default ProfileScreen;
