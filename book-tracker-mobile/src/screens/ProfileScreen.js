import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { userAPI, authAPI, userbooksAPI } from '../services/api';
import { PreloadContext } from '../../App';
import { colors, radius, shadow } from '../theme';

const ProfileScreen = ({ navigation, onLogout }) => {
  const preloaded = useContext(PreloadContext);
  const [profile, setProfile] = useState(preloaded?.profile || null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(!preloaded?.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  useEffect(() => {
    if (preloaded?.profile && preloaded?.library) {
      // Calculate stats from preloaded library data
      setBioText(preloaded.profile?.bio || '');
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
      setBioText(profileData?.bio || '');
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

  const saveBio = async () => {
    setSavingBio(true);
    try {
      await userAPI.updateProfile({ bio: bioText });
      setProfile(prev => ({ ...prev, bio: bioText }));
      setEditingBio(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to save bio');
    }
    setSavingBio(false);
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
        <View>
          <Text style={styles.headerLabel}>MY ACCOUNT</Text>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <TouchableOpacity onPress={() => navigation?.navigate('Settings')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={22} color={colors.primary} />
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

          {/* Bio section */}
          {editingBio ? (
            <View style={styles.bioEditContainer}>
              <TextInput
                style={styles.bioInput}
                value={bioText}
                onChangeText={setBioText}
                placeholder="Write something about yourself…"
                multiline
                maxLength={200}
                autoFocus
              />
              <View style={styles.bioActions}>
                <TouchableOpacity onPress={() => setEditingBio(false)} style={styles.bioCancelBtn}>
                  <Text style={styles.bioCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveBio} disabled={savingBio} style={[styles.bioSaveBtn, savingBio && { opacity: 0.6 }]}>
                  {savingBio
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.bioSaveText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => { setBioText(profile?.bio || ''); setEditingBio(true); }} style={styles.bioDisplayRow}>
              <Text style={profile?.bio ? styles.bioText : styles.bioPlaceholder}>
                {profile?.bio || 'Add a bio…'}
              </Text>
              <Text style={styles.bioEditIcon}>✏️</Text>
            </TouchableOpacity>
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
          <Text style={styles.versionText}>
            Version {Constants.expoConfig?.version || '1.0.0'} (Build {Constants.expoConfig?.android?.versionCode || '?'})
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    backgroundColor: colors.surface, paddingHorizontal: 20,
    paddingTop: 56, paddingBottom: 16,
  },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.secondary, marginBottom: 2 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: colors.primary },
  settingsBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  scrollView: { flex: 1 },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: 16, marginVertical: 8,
    padding: 20, borderRadius: radius.lg,
    alignItems: 'center', ...shadow.card,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  avatarText: { color: colors.onPrimary, fontSize: 34, fontWeight: '800' },
  userName: { fontSize: 22, fontWeight: '800', color: colors.onSurface, marginBottom: 3 },
  userEmail: { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 6 },
  memberSince: { fontSize: 11, color: colors.outline, marginBottom: 12 },
  bioDisplayRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingHorizontal: 8 },
  bioText: { flex: 1, fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  bioPlaceholder: { flex: 1, fontSize: 14, color: colors.outlineVariant, textAlign: 'center', fontStyle: 'italic' },
  bioEditIcon: { fontSize: 14, marginLeft: 6 },
  bioEditContainer: { width: '100%', marginTop: 8 },
  bioInput: {
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.md, padding: 10,
    fontSize: 14, color: colors.onSurface, minHeight: 70, textAlignVertical: 'top',
  },
  bioActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 },
  bioCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  bioCancelText: { fontSize: 14, color: colors.onSurfaceVariant },
  bioSaveBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.primary },
  bioSaveText: { fontSize: 14, color: colors.onPrimary, fontWeight: '600' },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface },
  statsGrid: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 4, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: colors.surfaceContainerLowest,
    padding: 18, borderRadius: radius.lg, alignItems: 'center', ...shadow.card,
  },
  statCardFull: { flex: 1 },
  statValue: { fontSize: 30, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  statLabel: { fontSize: 13, color: colors.onSurfaceVariant, textAlign: 'center' },
  yearStat: { width: '100%', marginBottom: 16 },
  yearStatLabel: { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 6 },
  yearStatValue: { fontSize: 26, fontWeight: '800', color: colors.primary },
  progressBarContainer: {
    width: '100%', height: 8, backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 4, marginTop: 8, overflow: 'hidden',
  },
  progressBar: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  progressText: { fontSize: 12, color: colors.outline, marginTop: 4 },
  aboutText: { fontSize: 14, color: colors.onSurfaceVariant, lineHeight: 21, textAlign: 'center', marginBottom: 14 },
  versionText: { fontSize: 11, color: colors.outline, textAlign: 'center' },
});

export default ProfileScreen;
