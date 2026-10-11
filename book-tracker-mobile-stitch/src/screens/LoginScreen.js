import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, Image, StatusBar, Platform, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { authAPI, warmUp } from '../services/api';
import { colors, radius, shadow, type } from '../theme';

// NOT a static import. iOS does not link this native module (react-native.config.js and the
// expo.autolinking.ios.exclude in package.json), and the package runs
//   TurboModuleRegistry.getEnforcing('RNGoogleSignin')
// at module scope — getEnforcing THROWS when the module is absent. A static import therefore
// crashes the app on launch before anything renders, which is exactly what the first
// TestFlight build did. Requiring it only off-iOS keeps the module out of the iOS bundle's
// execution path entirely.
const GoogleSignin = Platform.OS === 'ios'
  ? null
  : require('@react-native-google-signin/google-signin').GoogleSignin;



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
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Dimensions.get('window') read at MODULE scope froze this to whatever the window was when
  // the bundle evaluated. On an iPad that is not the rendered width - the scene is sized
  // afterwards, and changes again on rotation or in Split View - so the third feature card
  // was cut off the right edge on the first TestFlight build. useWindowDimensions recomputes
  // on every change.
  const { width: screenW } = useWindowDimensions();
  const cardW = (screenW - 48 - 16) / 3;   // 24px padding each side, 8px gap x 2

  useEffect(() => {
    // iOS is Apple-only (E-6) and the Google native module is not linked there at all
    // (react-native.config.js). Calling into an unlinked module throws, and this effect runs
    // on mount, so the guard is what keeps the iOS login screen from dying before it paints.
    if (Platform.OS !== 'ios') {
      GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
    }
    warmUp();   // fire-and-forget: wake a sleeping Render instance before the account picker returns (F-31)
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable, () => setAppleAvailable(false));   // Sprint 4G (R-09)
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

  // ── Sprint 4G: Sign in with Apple (R-09, R-10, pm-decisions E-5/E-6) ───────
  // A sibling of handleSignIn, which is not edited. iOS is Apple-only (E-6), so there is no
  // second provider to fall back to — which is exactly why the is_new branch below is a
  // requirement and not polish: a reader whose Apple ID address differs from their account's,
  // or who taps Hide My Email, lands on a NEW, EMPTY account and must be told so.
  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      // R-10: a fresh 64-char hex nonce per attempt, from expo-crypto's CSPRNG. Never
      // Math.random, never module scope. It goes to Apple and to our server unmodified —
      // Apple echoes it into the token's `nonce` claim and apple_keys.py compares the two
      // byte for byte (its floor is 32 characters).
      const nonce = Array.from(Crypto.getRandomBytes(32)).map(b => b.toString(16).padStart(2, '0')).join('');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      // Apple gives fullName on the first authorization only. Nothing is invented here: when
      // both parts are absent this is '' and api.js omits the field (R-07, A-06).
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
      const data = await authAPI.appleLogin(credential.identityToken, nonce, fullName);
      await authAPI.saveToken(data.access_token);
      if (data.is_new) {
        // E-5, after the fact. `private_relay` (pm-decisions addendum Q-1) is the one case the
        // server can identify exactly; without it the message must stay true both for a
        // genuinely new reader and for someone who already has an account under another
        // address, because nothing can tell those two apart.
        Alert.alert(
          t('auth.appleNewAccountTitle'),
          data.private_relay ? t('auth.appleNewAccountRelayBody') : t('auth.appleNewAccountBody'),
        );
      }
      onLoginSuccess?.();
    } catch (error) {
      if (error.code === 'ERR_REQUEST_CANCELED') { /* reader dismissed the sheet — silent, as SIGN_IN_CANCELLED is */ }
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
            <View key={card.title} style={[styles.featureCard, { width: cardW }]}>
              <Text style={styles.featureEmoji}>{card.emoji}</Text>
              <Text style={styles.featureTitle}>{card.title}</Text>
              <Text style={styles.featureDesc}>{card.desc}</Text>
            </View>
          ))}
        </View>

        {/* Apple sign-in (Sprint 4G). The gate is isAvailableAsync(), never Platform.OS:
            it is false on Android AND on an iOS build where the sheet would not work, so it
            is the only check that can never render a dead button. The notice above the button
            is E-5's "before the tap" half and is a requirement, not copy polish. */}
        {appleAvailable && (<>
          <Text style={styles.appleNotice}>{t('auth.appleNoticeBeforeTap')}</Text>
          {loading ? (
            // The native button takes no `disabled` and ignores any style we give it, so the
            // Google button's own idiom is reused instead: swap the control for a spinner of
            // the same footprint. That is both the feedback and the re-entrancy guard — while
            // the request is in flight there is no Apple button on screen to tap twice.
            <View style={styles.appleLoading}>
              <ActivityIndicator color={colors.onSurface} size="small" />
            </View>
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={APPLE_BTN_HEIGHT / 2}
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
            />
          )}
        </>)}

        {/* iOS is Apple-only (pm-decisions E-6): there is no iOS Google client, so the Google
            button must not render where it could not work. The guard is deliberately OUTSIDE
            the block below — every byte of it is unchanged from 5fc8ccc (A-02a). */}
        {!appleAvailable && (<>
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
        </>)}

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


// Sprint 4G (R-09, tests.md K-03). `googleBtn` declares no height — its rendered height is
// resolved from its content: a Text in `type.title` (lineHeight 24) plus paddingVertical 15
// twice plus borderWidth 1.5 twice = 57. AppleAuthenticationButton is a native view with no
// intrinsic size in RN, so it needs that number explicitly, and the number is written here
// once rather than guessed: A-02 recomputes it from theme.js and from googleBtn itself and
// goes red if either source moves.
const APPLE_BTN_HEIGHT = 57;

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
    backgroundColor: colors.surfaceContainerLow,
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

  // Apple button — same width, same gap and the same rendered height as the Google pill.
  // Apple's HIG asks that their button not be smaller than the alternatives.
  // NO borderRadius and NO backgroundColor here, deliberately: expo-apple-authentication
  // documents that both are ignored on this native view and that setting them is against the
  // App Store guidelines. The corner comes from the `cornerRadius` PROP, which is given
  // APPLE_BTN_HEIGHT / 2 — the same pill the Google button's radius.full (999) clamps to.
  // Height and width must be styles, though: without them the native view does not appear.
  appleBtn: {
    width: '100%', height: APPLE_BTN_HEIGHT,
    marginBottom: 20,
  },
  // The in-flight stand-in. Same footprint as appleBtn, so swapping them shifts nothing;
  // this one is an ordinary View, so centring it is allowed.
  appleLoading: {
    width: '100%', height: APPLE_BTN_HEIGHT,
    marginBottom: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  appleNotice: { ...type.caption, color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 12 },

  // Trust badge
  trustRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatarStack:    { flexDirection: 'row', alignItems: 'center' },
  trustAvatar:    { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.surface },
  trustText:      { ...type.bodySm, color: colors.onSurfaceVariant },
});
