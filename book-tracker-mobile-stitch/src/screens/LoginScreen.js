import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, Image, StatusBar, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../services/api';
import { colors, radius, shadow, type } from '../theme';


const SCREEN_W = Dimensions.get('window').width;

const HERO_IMAGE  = 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&q=80';
const WEB_CLIENT_ID = '580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com';

const TRUST_AVATARS = [
  { uri: 'https://i.pravatar.cc/56?img=47' },
  { uri: 'https://i.pravatar.cc/56?img=12' },
  { uri: 'https://i.pravatar.cc/56?img=32' },
];

// ── Screen ────────────────────────────────────────────────────────────────────
export default function LoginScreen({ onLoginSuccess }) {
  const { t } = useTranslation();
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
      else if (error.code === 'IN_PROGRESS') Alert.alert(t('auth.errorPleaseWait'), t('auth.errorAlreadyInProgress'));
      else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') Alert.alert(t('common.error'), t('auth.errorGooglePlayServices'));
      else Alert.alert(t('auth.errorSignInFailed'), error.message || '');
    } finally {
      setLoading(false);
    }
  };

  const featureCards = [
    { emoji: '📚', title: t('auth.featureTrackTitle'), desc: t('auth.featureTrackDesc') },
    { emoji: '✍️', title: t('auth.featureReflectTitle'), desc: t('auth.featureReflectDesc') },
    { emoji: '👥', title: t('auth.featureDiscoverTitle'), desc: t('auth.featureDiscoverDesc') },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Logo */}
        <View style={styles.logoRow}>
          <MaterialCommunityIcons name="book-open-variant" size={26} color={colors.primary} />
          <Text style={styles.logoText}>{t('auth.appName')}</Text>
        </View>

        {/* Hero image card */}
        <View style={styles.heroCard}>
          <Image source={{ uri: HERO_IMAGE }} style={styles.heroImage} resizeMode="cover" />
          <View style={styles.quoteOverlay}>
            <Text style={styles.quoteDecor}>"</Text>
            <Text style={styles.quoteText}>{t('auth.quote')}</Text>
            <Text style={styles.quoteAuthor}>— {t('auth.quoteAuthor')}</Text>
          </View>
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>
          <Text style={styles.taglineDark}>{t('auth.tagline').split('\n')[0]}{'\n'}</Text>
          <Text style={styles.taglineItalic}>{t('auth.tagline').split('\n')[1]}</Text>
        </Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>{t('auth.description')}</Text>

        {/* Feature cards */}
        <View style={styles.featureRow}>
          {featureCards.map(card => (
            <View key={card.title} style={styles.featureCard}>
              <Text style={styles.featureEmoji}>{card.emoji}</Text>
              <Text style={styles.featureTitle}>{card.title}</Text>
              <Text style={styles.featureDesc}>{card.desc}</Text>
            </View>
          ))}
        </View>

        {/* Google sign-in */}
        <TouchableOpacity style={styles.googleBtn} onPress={handleSignIn} disabled={loading} activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color={colors.onSurface} size="small" />
          ) : (
            <>
              <Svg width={20} height={20} viewBox="0 0 48 48">
                <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </Svg>
              <Text style={styles.googleBtnText}>{t('auth.signInWithGoogle')}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Trust badge */}
        <View style={styles.trustRow}>
          <View style={styles.avatarStack}>
            {TRUST_AVATARS.map((a, i) => (
              <Image
                key={i}
                source={{ uri: a.uri }}
                style={[styles.trustAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i }]}
              />
            ))}
          </View>
          <Text style={styles.trustText}>{t('auth.socialProof')}</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const CARD_W = (SCREEN_W - 48 - 16) / 3; // 24px padding each side, 8px gap × 2

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll:    { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40 },

  // Logo
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 24 },
  logoText: { ...type.titleLg, color: colors.primary, letterSpacing: -0.5 },

  // Hero
  heroCard:  { borderRadius: radius.xl, overflow: 'hidden', marginBottom: 22, ...shadow.float },
  heroImage: { width: '100%', height: 260 },
  quoteOverlay: {
    position: 'absolute', top: '18%', right: 14, width: 190,
    backgroundColor: 'rgba(251,249,244,0.93)', borderRadius: radius.lg, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  quoteDecor:  { fontFamily: 'NotoSerif_700Bold', fontSize: 36, lineHeight: 36, color: '#b0a898', marginBottom: 2 },
  quoteText:   { ...type.bodySm, fontFamily: 'NotoSerif_400Italic', color: colors.onSurface },
  quoteAuthor: { ...type.caption, color: colors.onSurfaceVariant, marginTop: 6, fontWeight: '600' },

  // Tagline
  tagline:      { marginBottom: 10 },
  taglineDark:  { fontFamily: 'NotoSerif_700Bold', fontSize: 28, lineHeight: 36, color: colors.primary },
  taglineItalic:{ fontFamily: 'NotoSerif_400Italic', fontSize: 28, lineHeight: 36, color: colors.secondary },
  subtitle:     { ...type.body, color: colors.onSurfaceVariant, marginBottom: 22 },

  // Feature cards
  featureRow:  { flexDirection: 'row', gap: 8, marginBottom: 26 },
  featureCard: {
    width: CARD_W, backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg, padding: 14, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.outlineVariant + '50',
  },
  featureEmoji: { fontSize: 22, marginBottom: 2 },
  featureTitle: { ...type.label, color: colors.primary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  featureDesc:  { ...type.caption, color: colors.onSurfaceVariant, textAlign: 'center' },

  // Google button — white per Google brand guidelines
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderRadius: radius.full,
    paddingVertical: 15, paddingHorizontal: 28, gap: 12,
    marginBottom: 20,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
    ...shadow.card,
  },
  googleBtnText: { ...type.title, color: colors.onSurface },

  // Trust badge
  trustRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatarStack:    { flexDirection: 'row', alignItems: 'center' },
  trustAvatar:    { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.surface },
  trustText:      { ...type.bodySm, color: colors.onSurfaceVariant },
});
