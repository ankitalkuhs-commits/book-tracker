import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, Image, StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&q=80';
const QUOTE = 'A reader lives a thousand lives before he dies.';
const QUOTE_AUTHOR = '— George R.R. Martin';
const WEB_CLIENT_ID = '580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com';

const TRUST_AVATARS = [
  { initials: 'A', bg: colors.surfaceContainerHighest },
  { initials: 'B', bg: colors.surfaceContainerHighest },
  { initials: 'C', bg: colors.surfaceContainerHighest },
];


export default function LoginScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
  }, []);

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
            <MaterialCommunityIcons name="format-quote-open" size={22} color={colors.secondary} style={{ marginBottom: 4 }} />
            <Text style={styles.quoteText}>{QUOTE}</Text>
            <Text style={styles.quoteAuthor}>{QUOTE_AUTHOR}</Text>
          </View>
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>
          Track your reading.{'\n'}
          <Text style={styles.taglineItalic}>Share your journey.</Text>
        </Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          The social home for book lovers. Log progress, share highlights, and discover your next favorite read with friends.
        </Text>

        {/* Google sign-in */}
        <TouchableOpacity style={styles.googleBtn} onPress={handleSignIn} disabled={loading} activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="google" size={20} color={colors.onPrimary} />
              <Text style={styles.googleBtnText}>Sign in with Google</Text>
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
          <Text style={styles.trustText}>Joined by 12,000+ curators</Text>
        </View>

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
    position: 'absolute', bottom: 16, right: 16, width: 180,
    backgroundColor: 'rgba(251,249,244,0.65)',
    borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  quoteText: { fontSize: 13, fontStyle: 'italic', color: colors.onSurface, lineHeight: 19, fontWeight: '500' },
  quoteAuthor: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 4, fontWeight: '600' },

  tagline: { fontSize: 22, fontWeight: '800', color: colors.onSurface, textAlign: 'left', marginBottom: 10, lineHeight: 30 },
  taglineItalic: { fontStyle: 'italic', color: colors.secondary, fontWeight: '400' },
  subtitle: { fontSize: 14, color: colors.onSurfaceVariant, lineHeight: 21, marginBottom: 28 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 15, paddingHorizontal: 28, gap: 10,
    ...shadow.float,
  },
  googleBtnText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },

  trustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 10 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  trustAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  trustAvatarText: { fontSize: 10, fontWeight: '700', color: colors.onSurface },
  trustText: { fontSize: 13, color: colors.onSurfaceVariant, fontWeight: '500' },

  bottomPad: { height: 20 },
});
