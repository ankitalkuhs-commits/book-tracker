// Stitch design system — React Native tokens
// Mirrors book-tracker-frontend-stitch/tailwind.config.js + index.css
//
// FONTS:
//   Body / UI  → Manrope (same as webapp)
//   Headings   → Noto Serif (same as webapp h1/h2/h3)
//
// USAGE in StyleSheet:
//   import { colors, radius, shadow, type } from '../theme';
//   titleText: { ...type.headline, color: colors.primary }

// ── Colors ────────────────────────────────────────────────────────────────────
export const colors = {
  primary:               '#00464a',
  primaryContainer:      '#006064',
  onPrimary:             '#ffffff',
  onPrimaryContainer:    '#8fd8dc',

  secondary:             '#735c00',
  secondaryContainer:    '#fed65b',
  onSecondary:           '#ffffff',
  onSecondaryContainer:  '#241a00',

  tertiary:              '#62330f',
  tertiaryContainer:     '#7e4924',
  onTertiary:            '#ffffff',

  surface:               '#fbf9f4',
  surfaceDim:            '#dbdad5',
  surfaceContainerLowest:'#ffffff',
  surfaceContainerLow:   '#f5f3ee',
  surfaceContainer:      '#f0eee9',
  surfaceContainerHigh:  '#eae8e3',
  surfaceContainerHighest:'#e4e2dd',
  surfaceVariant:        '#e4e2dd',

  onSurface:             '#1b1c19',
  onSurfaceVariant:      '#3f4949',
  outline:               '#6f7979',
  outlineVariant:        '#bec8c9',

  error:                 '#ba1a1a',
  onError:               '#ffffff',
  errorContainer:        '#ffdad6',
};

// ── Border radius ─────────────────────────────────────────────────────────────
export const radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  full: 999,
};

// ── Shadows ───────────────────────────────────────────────────────────────────
export const shadow = {
  card: {
    shadowColor: '#1b1c19',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  float: {
    shadowColor: '#1b1c19',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
};

// ── Typography scale ──────────────────────────────────────────────────────────
// Matches webapp: Noto Serif for headings, Manrope for body/UI
// Spread into StyleSheet objects:  { ...type.headline, color: colors.primary }

export const type = {
  // ── Noto Serif (editorial / heading) ──────────────────────────────────────
  // Large hero numbers, yearly stat values
  display: {
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
  },
  // Page-level titles — header h1 ("Your Library", "Insights", etc.)
  headline: {
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '700',
  },
  // Section headings, book titles, modal titles
  titleLg: {
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
  },

  // ── Manrope (body / UI) ───────────────────────────────────────────────────
  // Top bar labels, card sub-headings, tab labels (active)
  title: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  // Default body text — descriptions, post content
  body: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '400',
  },
  // Secondary body — metadata, secondary descriptions
  bodySm: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '400',
  },
  // Buttons, input field labels, strong inline labels
  label: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  // Timestamps, bylines, small metadata
  caption: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  // Uppercase section labels — "CURRENTLY READING", "MY LIBRARY"
  eyebrow: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
};

// ── Font loading map (for App.js useFonts) ────────────────────────────────────
// Import from @expo-google-fonts packages, pass this object to useFonts()
export const fontMap = {
  Manrope_400Regular:  require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'),
  Manrope_500Medium:   require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
  Manrope_600SemiBold: require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'),
  Manrope_700Bold:     require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
  Manrope_800ExtraBold:require('@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf'),
  NotoSerif_400Regular:require('@expo-google-fonts/noto-serif/400Regular/NotoSerif_400Regular.ttf'),
  NotoSerif_400Italic: require('@expo-google-fonts/noto-serif/400Regular_Italic/NotoSerif_400Regular_Italic.ttf'),
  NotoSerif_700Bold:   require('@expo-google-fonts/noto-serif/700Bold/NotoSerif_700Bold.ttf'),
};
