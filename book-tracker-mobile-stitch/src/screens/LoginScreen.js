import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, Image, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authAPI, notesAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&q=80';
const QUOTE = '"A reader lives a thousand lives before he dies."';
const QUOTE_AUTHOR = '— George R.R. Martin';
const WEB_CLIENT_ID = '580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com';

const TRUST_AVATARS = [
  { initials: 'AM', bg: '#c8e6c9' },
  { initials: 'RK', bg: '#bbdefb' },
  { initials: 'SJ', bg: '#f8bbd0' },
];

function PostCard({ post }) {
  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts)) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <View style={styles.postCard}>
      <View style={styles.postMeta}>
        <View style={styles.postAvatar}>
          <Text style={styles.postAvatarText}>{(post.user_name || post.author || 'R')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthor}>{post.user_name || post.author || 'Reader'}</Text>
          <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
        </View>
        <View style={styles.postBadge}>
          <Ionicons name="book-outline" size={12} color={colors.primary} />
          <Text style={styles.postBadgeText}>Reading</Text>
        </View>
      </View>
      {post.text ? <Text style={styles.postText} numberOfLines={4}>{post.text}</Text> : null}
      {post.quote ? (
        <View style={styles.postQuoteBlock}>
          <Text style={styles.postQuoteText} numberOfLines={3}>"{post.quote}"</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function LoginScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
    loadFeed();
  }, []);

  const loadFeed = async () => {
    try {
      const data = await notesAPI.getCommunityFeed(8);
      setPosts(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch { /* silently ignore — social proof only */ }
  };

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await GoogleSignin.signOut();
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const data = await authAPI.googleLogin(tokens.idToken);
      await authAPI.saveToken(data.access_token);
      onLoginSuccess?.();
    } catch (error) {
      if (error.code === 'SIGN_IN_CANCELLED') { /* user dismissed */ }
      else if (error.code === 'IN_PROGRESS') Alert.alert('Please wait', 'Sign-in already in progress');
      else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') Alert.alert('Error', 'Google Play Services not available');
      else Alert.alert('Sign In Failed', error.message || 'Could not sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Logo */}
        <View style={styles.logoRow}>
          <Ionicons name="book" size={28} color={colors.primary} />
          <Text style={styles.logoText}>TrackMyRead</Text>
        </View>

        {/* Hero image card */}
        <View style={styles.heroCard}>
          <Image source={{ uri: HERO_IMAGE }} style={styles.heroImage} resizeMode="cover" />
          {/* Glassmorphism quote overlay */}
          <View style={styles.quoteOverlay}>
            <Text style={styles.quoteText}>{QUOTE}</Text>
            <Text style={styles.quoteAuthor}>{QUOTE_AUTHOR}</Text>
          </View>
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>
          Track your reading.{' '}
          <Text style={styles.taglineItalic}>Share your journey.</Text>
        </Text>

        {/* Google sign-in */}
        <TouchableOpacity style={styles.googleBtn} onPress={handleSignIn} disabled={loading} activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <View style={styles.googleIconBubble}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Trust badge */}
        <View style={styles.trustRow}>
          <View style={styles.avatarStack}>
            {TRUST_AVATARS.map((a, i) => (
              <View key={i} style={[styles.trustAvatar, { backgroundColor: a.bg, marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i }]}>
                <Text style={styles.trustAvatarText}>{a.initials}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.trustText}>Joined by 12,000+ readers</Text>
        </View>

        {/* Community feed */}
        {posts.length > 0 && (
          <View style={styles.feedSection}>
            <Text style={styles.feedTitle}>What readers are sharing</Text>
            {posts.map(post => <PostCard key={post.id} post={post} />)}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  logoText: { fontSize: 26, fontWeight: '800', color: colors.primary, letterSpacing: -0.5 },

  heroCard: { borderRadius: radius.xl, overflow: 'hidden', marginBottom: 20, ...shadow.float },
  heroImage: { width: '100%', height: 220 },
  quoteOverlay: {
    position: 'absolute', bottom: 14, right: 14, left: 60,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: radius.lg, padding: 12,
  },
  quoteText: { fontSize: 13, fontStyle: 'italic', color: colors.onSurface, lineHeight: 19, fontWeight: '500' },
  quoteAuthor: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 4, fontWeight: '600' },

  tagline: { fontSize: 20, fontWeight: '700', color: colors.onSurface, textAlign: 'center', marginBottom: 28, lineHeight: 28 },
  taglineItalic: { fontStyle: 'italic', color: colors.primary },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 15, paddingHorizontal: 28, gap: 12,
    ...shadow.float,
  },
  googleIconBubble: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  googleIconText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  googleBtnText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },

  trustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 10 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  trustAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  trustAvatarText: { fontSize: 10, fontWeight: '700', color: colors.onSurface },
  trustText: { fontSize: 13, color: colors.onSurfaceVariant, fontWeight: '500' },

  feedSection: { marginTop: 32 },
  feedTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurfaceVariant, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14 },

  postCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, marginBottom: 10, ...shadow.card },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  postAvatarText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  postAuthor: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  postTime: { fontSize: 11, color: colors.outline, marginTop: 1 },
  postBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '12', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  postBadgeText: { fontSize: 10, fontWeight: '600', color: colors.primary },
  postText: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  postQuoteBlock: { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 10, marginTop: 8 },
  postQuoteText: { fontSize: 13, fontStyle: 'italic', color: colors.onSurfaceVariant, lineHeight: 19 },

  bottomPad: { height: 20 },
});
