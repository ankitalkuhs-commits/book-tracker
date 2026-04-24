import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, Image, StatusBar,
  Animated, Easing, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authAPI } from '../services/api';
import { colors, radius, shadow, type } from '../theme';

const SCREEN_W = Dimensions.get('window').width;

const HERO_IMAGE = 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&q=80';
const QUOTE      = 'A reader lives a thousand lives before he dies.';
const QUOTE_AUTH = '— George R.R. Martin';
const WEB_CLIENT_ID = '580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com';

const TRUST_AVATARS = [
  { initials: 'A', bg: colors.surfaceContainerHighest },
  { initials: 'B', bg: colors.surfaceContainerHighest },
  { initials: 'C', bg: colors.surfaceContainerHighest },
];

const FEATURES = [
  '📚 Track every book you read',
  '✍️ Share reflections & highlights',
  '🔍 Discover your next favourite read',
  '👥 Join curated reading circles',
  '🎯 Set & crush your reading goals',
  '📊 See deep reading insights',
  '🤝 Follow fellow readers',
];

// ── Multicolour Google G (no SVG package needed) ──────────────────────────────
function GoogleGIcon({ size = 22 }) {
  const h         = size / 2;
  const thickness = Math.round(size * 0.19);
  const barH      = Math.round(size * 0.26);
  const innerSize = size - thickness * 2;
  const innerR    = innerSize / 2;

  return (
    <View style={{ width: size, height: size, borderRadius: h, overflow: 'hidden' }}>
      {/* Four colour quadrants */}
      <View style={{ position: 'absolute', top: 0,  left: 0, width: h, height: h, backgroundColor: '#4285F4' }} />
      <View style={{ position: 'absolute', top: 0,  left: h, width: h, height: h, backgroundColor: '#EA4335' }} />
      <View style={{ position: 'absolute', top: h,  left: 0, width: h, height: h, backgroundColor: '#34A853' }} />
      <View style={{ position: 'absolute', top: h,  left: h, width: h, height: h, backgroundColor: '#FBBC05' }} />
      {/* Inner white ring cutout */}
      <View style={{
        position: 'absolute', top: thickness, left: thickness,
        width: innerSize, height: innerSize, borderRadius: innerR,
        backgroundColor: 'white',
      }} />
      {/* Blue crossbar — on top of white cutout */}
      <View style={{
        position: 'absolute',
        top: h - Math.round(barH / 2),
        left: h - Math.round(thickness / 2),
        right: 0,
        height: barH,
        backgroundColor: '#4285F4',
      }} />
    </View>
  );
}

// ── Infinite marquee ──────────────────────────────────────────────────────────
const MARQUEE_TEXT = FEATURES.join('   ·   ') + '   ·   ' + FEATURES.join('   ·   ');
const MARQUEE_DURATION = 28000;

function Marquee() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: MARQUEE_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_W, -(SCREEN_W * 4.5)],
  });

  return (
    <View style={styles.marqueeWrap}>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <Text style={styles.marqueeText} numberOfLines={1}>{MARQUEE_TEXT}</Text>
      </Animated.View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
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
      const data   = await authAPI.googleLogin(tokens.idToken);
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
          <MaterialCommunityIcons name="book-open-variant" size={26} color={colors.primary} />
          <Text style={styles.logoText}>TrackMyRead</Text>
        </View>

        {/* Hero image card */}
        <View style={styles.heroCard}>
          <Image source={{ uri: HERO_IMAGE }} style={styles.heroImage} resizeMode="cover" />
          {/* Quote overlay — solid cream card, centre-right */}
          <View style={styles.quoteOverlay}>
            <Text style={styles.quoteDecor}>"</Text>
            <Text style={styles.quoteText}>{QUOTE}</Text>
            <Text style={styles.quoteAuthor}>{QUOTE_AUTH}</Text>
          </View>
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>
          <Text style={styles.taglineDark}>Track your reading.{'\n'}</Text>
          <Text style={styles.taglineItalic}>Share your journey.</Text>
        </Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          The social home for book lovers. Log progress, share highlights, and discover your next favourite read with friends.
        </Text>

        {/* Google sign-in */}
        <TouchableOpacity style={styles.googleBtn} onPress={handleSignIn} disabled={loading} activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <GoogleGIcon size={22} />
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

      </ScrollView>

      {/* Marquee — outside ScrollView so it sticks at the bottom */}
      <View style={styles.marqueeContainer}>
        <View style={styles.marqueeDivider} />
        <Marquee />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll:    { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },

  // Logo
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 24 },
  logoText: { ...type.titleLg, color: colors.primary, letterSpacing: -0.5 },

  // Hero
  heroCard:  { borderRadius: radius.xl, overflow: 'hidden', marginBottom: 22, ...shadow.float },
  heroImage: { width: '100%', height: 260 },

  quoteOverlay: {
    position: 'absolute',
    top: '18%', right: 14,
    width: 190,
    backgroundColor: 'rgba(251,249,244,0.93)',
    borderRadius: radius.lg,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  quoteDecor:  { fontFamily: 'NotoSerif_700Bold', fontSize: 36, lineHeight: 36, color: '#b0a898', marginBottom: 2 },
  quoteText:   { ...type.bodySm, fontFamily: 'NotoSerif_400Italic', color: colors.onSurface },
  quoteAuthor: { ...type.caption, color: colors.onSurfaceVariant, marginTop: 6, fontWeight: '600' },

  // Tagline
  tagline:      { marginBottom: 10 },
  taglineDark:  { fontFamily: 'NotoSerif_700Bold', fontSize: 28, lineHeight: 36, color: colors.primary },
  taglineItalic:{ fontFamily: 'NotoSerif_400Italic', fontSize: 28, lineHeight: 36, color: colors.secondary },
  subtitle:     { ...type.body, color: colors.onSurfaceVariant, marginBottom: 28 },

  // Google button
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 15, paddingHorizontal: 28, gap: 12,
    marginBottom: 18,
    ...shadow.float,
  },
  googleBtnText: { ...type.title, color: colors.onPrimary },

  // Trust badge
  trustRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatarStack:    { flexDirection: 'row', alignItems: 'center' },
  trustAvatar:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  trustAvatarText:{ ...type.eyebrow, color: colors.onSurface },
  trustText:      { ...type.bodySm, color: colors.onSurfaceVariant },

  // Marquee
  marqueeContainer: { paddingBottom: 20, backgroundColor: colors.surface },
  marqueeDivider:   { height: 1, backgroundColor: colors.outlineVariant + '40', marginBottom: 10, marginTop: 8 },
  marqueeWrap:      { overflow: 'hidden', paddingVertical: 4 },
  marqueeText:      { ...type.bodySm, color: colors.onSurfaceVariant },
});
