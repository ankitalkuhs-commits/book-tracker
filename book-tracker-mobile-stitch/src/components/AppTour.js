/**
 * AppTour — in-app spotlight coach marks for mobile.
 *
 * Same pattern as the web AppTour.jsx:
 *  - Real app visible underneath
 *  - 4-rect dark overlay with transparent spotlight
 *  - Tooltip card with Next / Back / Skip
 *  - Action steps: avatar picker + goal setter embedded inline
 *
 * Spotlight positions are calculated from screen dimensions:
 *  - Tabs: evenly spaced in a 60px bottom tab bar
 *  - Avatar: top-right of AppHeader
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Animated,
  Dimensions, Image, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, shadow } from '../theme';
import { userAPI, profileAPI, booksAPI } from '../services/api';

export const TOUR_KEY = 'bt_tour_v1';   // bump to reset for all users

const { width: SW, height: SH } = Dimensions.get('window');
const TAB_H    = 60;   // matches AppNavigator tabBarStyle.height
const PAD      = 10;   // spotlight padding

// DiceBear avatar presets (same seeds as SettingsScreen)
const AVATAR_SEEDS = ['Aneka','Buster','Callie','Destiny','Emery','Felix','Gracie','Harley'];
const AVATAR_BG    = ['#c8e6f5','#dcc8f0','#c8e6c9','#f5dcc8','#f5c8c8','#c8ddf5','#e8c8f5','#f5f0c8'];
const AVATARS = AVATAR_SEEDS.map((seed, i) => ({
  id:  seed,
  url: `https://api.dicebear.com/9.x/adventurer/png?seed=${seed}&size=200`,
  bg:  AVATAR_BG[i],
}));

const GOAL_PRESETS = [6, 12, 24, 36, 52];

// ── Spotlight geometry helpers ────────────────────────────────────────────────

function tabSpot(insets, index) {
  const tabBarTop = SH - TAB_H - insets.bottom;
  const tabW = SW / 4;
  const cx = tabW * index + tabW / 2;
  return {
    x: cx - 40,
    y: tabBarTop + 4,
    w: 80,
    h: TAB_H - 8,
    r: 12,
  };
}

function avatarSpot(insets) {
  // AppHeader: paddingTop = insets.top + 10, height ~56 total
  // Avatar is at right edge: x = SW - 16 - 36 = SW - 52
  const headerMid = insets.top + 10 + 18;  // rough center of avatar
  return {
    x: SW - 58,
    y: headerMid - 22,
    w: 44,
    h: 44,
    r: 22,
  };
}

// ── Step definitions ──────────────────────────────────────────────────────────
// type: 'spotlight' | 'avatar' | 'goal' | 'done'

function buildSteps(insets) {
  return [
    {
      type: 'spotlight',
      spot: tabSpot(insets, 0),
      title: 'Your Reading Feed',
      body:  "See what friends are reading, their highlights and milestones — all in one place.",
      placement: 'above',
    },
    {
      type: 'spotlight',
      spot: tabSpot(insets, 1),
      title: 'Your Shelf',
      body:  "Track every book — reading, want to read, finished. Log page progress anytime.",
      placement: 'above',
    },
    {
      type: 'spotlight',
      spot: tabSpot(insets, 2),
      title: 'Reading Circles',
      body:  "Join circles, compete on leaderboards, and discuss books with friends.",
      placement: 'above',
    },
    {
      type: 'spotlight',
      spot: tabSpot(insets, 3),
      title: 'Track Your Progress',
      body:  "See your reading streaks, pages per day, and yearly goal — all visualised.",
      placement: 'above',
    },
    {
      type: 'avatar',
      spot: avatarSpot(insets),
      title: 'Add Your Avatar',
      body:  "Pick a character or upload a photo. Let friends recognise you in the feed.",
      placement: 'below',
    },
    {
      type: 'goal',
      title: 'Set a Reading Goal',
      body:  "How many books do you want to read this year? You can always change this in Settings.",
    },
    {
      type: 'book',
      title: 'Add Your First Book',
      body:  "Search for a book you're reading now, or want to read next.",
    },
    {
      type: 'done',
      title: "You're all set!",
      body:  "Explore the app, add books, and connect with fellow readers.",
    },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AppTour({ onDone }) {
  const insets = useSafeAreaInsets();
  const steps  = buildSteps(insets);

  const [step,       setStep]       = useState(0);
  const fadeAnim                    = useRef(new Animated.Value(0)).current;

  // Avatar step state
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [savingAvatar,   setSavingAvatar]   = useState(false);

  // Goal step state
  const [goal,       setGoal]       = useState(12);
  const [useCustom,  setUseCustom]  = useState(false);
  const [customGoal, setCustomGoal] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  // Book step state
  const [bookQuery,    setBookQuery]    = useState('');
  const [bookResults,  setBookResults]  = useState([]);
  const [searchingBook,setSearchingBook]= useState(false);
  const [addedBook,    setAddedBook]    = useState(null);
  const [addingBook,   setAddingBook]   = useState(null); // google_books_id being added
  const bookSearchTimer                  = useRef(null);

  const current = steps[step];
  const total   = steps.length;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, []);

  const animateStep = (next) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const finish = async () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(async () => {
      await AsyncStorage.setItem(TOUR_KEY, '1');
      onDone?.();
    });
  };

  const handleBookSearch = (query) => {
    setBookQuery(query);
    clearTimeout(bookSearchTimer.current);
    if (!query.trim()) { setBookResults([]); return; }
    bookSearchTimer.current = setTimeout(async () => {
      setSearchingBook(true);
      try {
        const res = await booksAPI.search(query);
        setBookResults((res.books || res || []).slice(0, 5));
      } catch { setBookResults([]); }
      finally { setSearchingBook(false); }
    }, 500);
  };

  const handleAddBook = async (book) => {
    setAddingBook(book.google_books_id);
    try {
      await booksAPI.addToLibrary({
        google_books_id: book.google_books_id,
        title:           book.title,
        author:          book.authors?.[0] || book.author || '',
        cover_url:       book.cover_url || book.thumbnail || '',
        status:          'to-read',
      });
      setAddedBook(book);
    } catch { /* non-fatal */ }
    finally { setAddingBook(null); }
  };

  const handleNext = async () => {
    // Save avatar if selected
    if (current.type === 'avatar' && selectedAvatar) {
      setSavingAvatar(true);
      try { await profileAPI.updateMe({ profile_picture: selectedAvatar.url }); } catch { /* non-fatal */ }
      setSavingAvatar(false);
    }
    // Save goal
    if (current.type === 'goal') {
      const finalGoal = useCustom ? parseInt(customGoal, 10) : goal;
      if (finalGoal > 0) {
        setSavingGoal(true);
        try { await userAPI.updateProfile({ yearly_goal: finalGoal }); } catch { /* non-fatal */ }
        setSavingGoal(false);
      }
    }

    if (step < total - 1) animateStep(step + 1);
    else finish();
  };

  const handleBack = () => {
    if (step > 0) animateStep(step - 1);
  };

  const spot = current.spot;
  const isLast = step === total - 1;
  const isBusy = savingAvatar || savingGoal || !!addingBook;

  // ── Spotlight geometry ────────────────────────────────────────────────────
  const sl = spot ? spot.x - PAD : 0;
  const st = spot ? spot.y - PAD : 0;
  const sw = spot ? spot.w + PAD * 2 : 0;
  const sh = spot ? spot.h + PAD * 2 : 0;

  // ── Tooltip position ──────────────────────────────────────────────────────
  const TOOLTIP_W = SW - 48;
  const TOOLTIP_X = 24;
  let tooltipY;

  if (current.placement === 'above') {
    // Tooltip above the spotlight
    tooltipY = st - 16 - 160; // estimate tooltip height ~160
    tooltipY = Math.max(insets.top + 60, tooltipY);
  } else if (current.placement === 'below') {
    tooltipY = st + sh + 16;
  } else {
    // Centered vertically
    tooltipY = SH / 2 - 120;
  }

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

        {/* ── Dark overlay — 4 rects ────────────────────────────────────── */}
        {spot ? (
          <>
            <View style={[styles.overlay, { top: 0, left: 0, right: 0, height: st }]} />
            <View style={[styles.overlay, { top: st + sh, left: 0, right: 0, bottom: 0 }]} />
            <View style={[styles.overlay, { top: st, left: 0, width: sl, height: sh }]} />
            <View style={[styles.overlay, { top: st, left: sl + sw, right: 0, height: sh }]} />
            {/* Spotlight ring */}
            <View style={[styles.spotRing, { top: st, left: sl, width: sw, height: sh, borderRadius: (spot.r || 12) + PAD }]} />
          </>
        ) : (
          <View style={[styles.overlay, StyleSheet.absoluteFillObject]} />
        )}

        {/* ── Progress dots ─────────────────────────────────────────────── */}
        <View style={[styles.dotsRow, { top: insets.top + 8 }]}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step && styles.dotActive,
                i < step  && styles.dotDone,
              ]}
            />
          ))}
        </View>

        {/* ── Skip ──────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.skipBtn, { top: insets.top + 6 }]}
          onPress={finish}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        {/* ── Tooltip card ──────────────────────────────────────────────── */}
        <View style={[styles.tooltip, { top: tooltipY, left: TOOLTIP_X, width: TOOLTIP_W }]}>

          {/* Arrow pointing down (for 'above' placement) */}
          {current.placement === 'above' && spot && (
            <View style={[styles.arrowDown, { left: Math.max(16, sl + sw / 2 - TOOLTIP_X - 8) }]} />
          )}

          <View style={styles.tooltipCard}>
            <View style={styles.tooltipHeader}>
              <Text style={styles.tooltipTitle}>{current.title}</Text>
              <Text style={styles.tooltipCount}>{step + 1}/{total}</Text>
            </View>
            <Text style={styles.tooltipBody}>{current.body}</Text>

            {/* ── Avatar picker (step 4) ───────────────────────────────── */}
            {current.type === 'avatar' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarScroll} contentContainerStyle={styles.avatarScrollContent}>
                {AVATARS.map(av => (
                  <TouchableOpacity
                    key={av.id}
                    onPress={() => setSelectedAvatar(av)}
                    activeOpacity={0.8}
                    style={[
                      styles.avatarTile,
                      { backgroundColor: av.bg },
                      selectedAvatar?.id === av.id && styles.avatarTileSelected,
                    ]}
                  >
                    <Image source={{ uri: av.url }} style={styles.avatarTileImg} />
                    {selectedAvatar?.id === av.id && (
                      <View style={styles.avatarCheck}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* ── Goal picker (step 5) ─────────────────────────────────── */}
            {current.type === 'goal' && (
              <View style={styles.goalBlock}>
                <View style={styles.goalPresets}>
                  {GOAL_PRESETS.map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => { setGoal(p); setUseCustom(false); }}
                      style={[styles.goalChip, !useCustom && goal === p && styles.goalChipActive]}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.goalNum, !useCustom && goal === p && styles.goalNumActive]}>{p}</Text>
                      <Text style={[styles.goalLabel, !useCustom && goal === p && styles.goalLabelActive]}>bks</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setUseCustom(true)}
                    style={[styles.goalChip, useCustom && styles.goalChipActive]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.goalNum, useCustom && styles.goalNumActive]}>#</Text>
                    <Text style={[styles.goalLabel, useCustom && styles.goalLabelActive]}>own</Text>
                  </TouchableOpacity>
                </View>
                {useCustom && (
                  <TextInput
                    style={styles.customGoalInput}
                    value={customGoal}
                    onChangeText={setCustomGoal}
                    keyboardType="number-pad"
                    placeholder="e.g. 20"
                    placeholderTextColor={colors.outline}
                    maxLength={3}
                    autoFocus
                  />
                )}
                {!useCustom && (
                  <Text style={styles.goalHint}>
                    ≈ {(goal / 12).toFixed(1)} books/month
                  </Text>
                )}
              </View>
            )}

            {/* ── Book search (step 6) ─────────────────────────────────── */}
            {current.type === 'book' && (
              <View style={styles.bookBlock}>
                {addedBook ? (
                  <View style={styles.bookAdded}>
                    {addedBook.cover_url || addedBook.thumbnail ? (
                      <Image source={{ uri: addedBook.cover_url || addedBook.thumbnail }} style={styles.bookAddedCover} />
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bookAddedTitle} numberOfLines={2}>{addedBook.title}</Text>
                      <Text style={styles.bookAddedSub}>{addedBook.authors?.[0] || addedBook.author}</Text>
                      <View style={styles.bookAddedBadge}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
                        <Text style={styles.bookAddedBadgeText}>Added to your shelf</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => { setAddedBook(null); setBookQuery(''); setBookResults([]); }} activeOpacity={0.7}>
                      <Text style={styles.bookChangeText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.bookSearchRow}>
                      <Ionicons name="search" size={14} color={colors.outline} style={{ marginRight: 6 }} />
                      <TextInput
                        style={styles.bookSearchInput}
                        value={bookQuery}
                        onChangeText={handleBookSearch}
                        placeholder="Search by title or author…"
                        placeholderTextColor={colors.outline}
                        returnKeyType="search"
                        autoCorrect={false}
                      />
                      {searchingBook && <ActivityIndicator size="small" color={colors.primary} />}
                    </View>
                    {bookResults.length > 0 && (
                      <ScrollView style={styles.bookResults} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {bookResults.map(book => (
                          <TouchableOpacity
                            key={book.google_books_id}
                            style={styles.bookResultRow}
                            onPress={() => handleAddBook(book)}
                            disabled={!!addingBook}
                            activeOpacity={0.75}
                          >
                            {book.cover_url || book.thumbnail ? (
                              <Image source={{ uri: book.cover_url || book.thumbnail }} style={styles.bookResultCover} />
                            ) : (
                              <View style={[styles.bookResultCover, styles.bookResultCoverFallback]}>
                                <Ionicons name="book" size={18} color={colors.outline} />
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={styles.bookResultTitle} numberOfLines={1}>{book.title}</Text>
                              <Text style={styles.bookResultAuthor} numberOfLines={1}>{book.authors?.[0] || book.author}</Text>
                            </View>
                            {addingBook === book.google_books_id ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                    {!bookQuery && (
                      <Text style={styles.bookSkipHint}>You can also skip and add books from your shelf later.</Text>
                    )}
                  </>
                )}
              </View>
            )}

            {/* ── Done illustration (step 7) ───────────────────────────── */}
            {current.type === 'done' && (
              <View style={styles.doneRow}>
                {[
                  selectedAvatar ? '🖼 Avatar set' : null,
                  `📖 Goal: ${useCustom ? (customGoal || '?') : goal} books`,
                  addedBook ? `📚 ${addedBook.title}` : null,
                ].filter(Boolean).map(item => (
                  <View key={item} style={styles.doneChip}>
                    <Text style={styles.doneChipText} numberOfLines={1}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Actions ─────────────────────────────────────────────── */}
            <View style={styles.actions}>
              {step > 0 ? (
                <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
                  <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
              ) : <View />}

              <TouchableOpacity
                onPress={handleNext}
                style={[styles.nextBtn, isBusy && { opacity: 0.7 }]}
                disabled={isBusy}
                activeOpacity={0.85}
              >
                {isBusy
                  ? <ActivityIndicator size="small" color={colors.onPrimary} />
                  : <Text style={styles.nextBtnText}>{isLast ? 'Start Reading' : 'Next →'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Arrow pointing up (for 'below' placement) */}
          {current.placement === 'below' && spot && (
            <View style={[styles.arrowUp, { left: Math.max(16, sl + sw / 2 - TOOLTIP_X - 8) }]} />
          )}
        </View>

      </Animated.View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  overlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  spotRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },

  // Progress dots
  dotsRow: {
    position: 'absolute',
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: { width: 22, backgroundColor: '#ffffff' },
  dotDone:   { backgroundColor: 'rgba(255,255,255,0.6)' },

  // Skip
  skipBtn: {
    position: 'absolute',
    right: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  skipText: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.65)' },

  // Tooltip
  tooltip: {
    position: 'absolute',
  },
  arrowDown: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: '#ffffff',
    marginBottom: -1,
    alignSelf: 'flex-start',
  },
  arrowUp: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: '#ffffff',
    marginTop: -1,
    alignSelf: 'flex-start',
  },

  tooltipCard: {
    backgroundColor: '#ffffff',
    borderRadius: radius.xl,
    padding: 16,
    ...shadow.float,
  },
  tooltipHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 6,
  },
  tooltipTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, flex: 1 },
  tooltipCount: { fontSize: 11, fontWeight: '500', color: colors.outline, marginLeft: 8 },
  tooltipBody:  { fontSize: 13, fontWeight: '400', color: colors.onSurfaceVariant, lineHeight: 20, marginBottom: 12 },

  // Avatar picker
  avatarScroll: { marginBottom: 12 },
  avatarScrollContent: { gap: 8, paddingRight: 4 },
  avatarTile: {
    width: 56, height: 56, borderRadius: 28,
    overflow: 'hidden', borderWidth: 2, borderColor: 'transparent',
  },
  avatarTileSelected: { borderColor: colors.primary, borderWidth: 3 },
  avatarTileImg: { width: '100%', height: '100%' },
  avatarCheck: {
    position: 'absolute', bottom: 2, right: 2,
    backgroundColor: '#ffffff', borderRadius: 8,
  },

  // Goal picker
  goalBlock: { marginBottom: 12 },
  goalPresets: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  goalChip: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    minWidth: 44,
  },
  goalChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  goalNum:        { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  goalNumActive:  { color: colors.onPrimary },
  goalLabel:      { fontSize: 9, fontWeight: '500', color: colors.outline },
  goalLabelActive:{ color: 'rgba(255,255,255,0.75)' },
  customGoalInput: {
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 16, fontWeight: '700', color: colors.onSurface,
    textAlign: 'center', marginBottom: 6,
  },
  goalHint: { fontSize: 12, color: colors.onSurfaceVariant },

  // Book search
  bookBlock: { marginBottom: 12 },
  bookSearchRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.outlineVariant,
    borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7,
    marginBottom: 8, backgroundColor: colors.surfaceContainerLow,
  },
  bookSearchInput: { flex: 1, fontSize: 13, color: colors.onSurface },
  bookResults: { maxHeight: 160 },
  bookResultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '30',
  },
  bookResultCover: { width: 36, height: 52, borderRadius: 4, backgroundColor: colors.surfaceContainerHighest },
  bookResultCoverFallback: { alignItems: 'center', justifyContent: 'center' },
  bookResultTitle:  { fontSize: 12, fontWeight: '700', color: colors.onSurface },
  bookResultAuthor: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },
  bookAdded: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md,
    padding: 10, borderWidth: 1.5, borderColor: colors.primary + '40',
  },
  bookAddedCover:  { width: 40, height: 58, borderRadius: 4 },
  bookAddedTitle:  { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  bookAddedSub:    { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  bookAddedBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  bookAddedBadgeText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  bookChangeText:  { fontSize: 12, color: colors.secondary, fontWeight: '600' },
  bookSkipHint:    { fontSize: 11, color: colors.outline, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  // Done chips
  doneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  doneChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: colors.outlineVariant + '50',
  },
  doneChipText: { fontSize: 12, fontWeight: '600', color: colors.onSurface },

  // Buttons
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  backBtnText: { fontSize: 13, fontWeight: '500', color: colors.onSurfaceVariant },
  nextBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20, paddingVertical: 9,
    borderRadius: radius.full,
    minWidth: 90, alignItems: 'center',
  },
  nextBtnText: { fontSize: 13, fontWeight: '700', color: colors.onPrimary },
});
