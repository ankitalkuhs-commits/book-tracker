import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Dimensions, TextInput, ActivityIndicator,
  StatusBar, FlatList, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../theme';
import { userAPI, booksAPI, userbooksAPI } from '../services/api';

const { width: SW } = Dimensions.get('window');

// ── Tab tour cards ────────────────────────────────────────────────────────────
const TABS = [
  {
    icon: 'newspaper-variant-outline',
    label: 'Feed',
    headline: 'Stay Connected',
    desc: 'See what your friends are reading, their highlights and reading milestones — all in one place.',
    color: '#00464a',
    bg: '#e8f5f5',
  },
  {
    icon: 'bookshelf',
    label: 'Library',
    headline: 'Your Shelf',
    desc: 'Track every book — currently reading, want to read, and finished. Log page progress anytime.',
    color: '#735c00',
    bg: '#fff8e1',
  },
  {
    icon: 'account-group-outline',
    label: 'Circles',
    headline: 'Read Together',
    desc: 'Join reading circles, compete on leaderboards, and discuss books with groups of friends.',
    color: '#62330f',
    bg: '#fef3ec',
  },
  {
    icon: 'chart-line',
    label: 'Insights',
    headline: 'Know Yourself',
    desc: 'Visualise your reading habit — streaks, pages per day, and yearly goal progress.',
    color: '#2e4d7b',
    bg: '#eef2fb',
  },
];

// ── Goal presets ──────────────────────────────────────────────────────────────
const GOAL_PRESETS = [6, 12, 24, 36, 52];

// ── Steps enum ───────────────────────────────────────────────────────────────
const STEPS = ['welcome', 'tour', 'goal', 'book', 'done'];

export default function OnboardingScreen({ onComplete }) {
  const insets = useSafeAreaInsets();
  const [step, setStep]             = useState(0);
  const [goal, setGoal]             = useState(12);
  const [customGoal, setCustomGoal] = useState('');
  const [useCustom, setUseCustom]   = useState(false);
  const [bookQuery, setBookQuery]   = useState('');
  const [bookResults, setBookResults] = useState([]);
  const [bookSearching, setBookSearching] = useState(false);
  const [addedBook, setAddedBook]   = useState(null);
  const [saving, setSaving]         = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const totalSteps = STEPS.length;

  const animateTo = (nextStep) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  };

  const handleNext = async () => {
    if (step === 2) {
      // Save reading goal
      const finalGoal = useCustom ? parseInt(customGoal, 10) : goal;
      if (finalGoal && finalGoal > 0) {
        setSaving(true);
        try { await userAPI.updateProfile({ yearly_goal: finalGoal }); } catch { /* non-fatal */ }
        setSaving(false);
      }
    }
    if (step < totalSteps - 1) {
      animateTo(step + 1);
    } else {
      onComplete?.();
    }
  };

  const handleSkip = () => {
    if (step < totalSteps - 1) animateTo(step + 1);
    else onComplete?.();
  };

  const searchBooks = async (q) => {
    if (!q || q.trim().length < 2) { setBookResults([]); return; }
    setBookSearching(true);
    try {
      const res = await booksAPI.search(q.trim());
      setBookResults((res?.items || res || []).slice(0, 6));
    } catch { setBookResults([]); }
    setBookSearching(false);
  };

  const handleAddBook = async (book) => {
    setSaving(true);
    try {
      await booksAPI.addToLibrary({
        google_books_id: book.google_id || book.id,
        title: book.title,
        author: book.author || (book.authors?.join(', ')),
        cover_url: book.cover_url || book.thumbnail,
        total_pages: book.total_pages || book.pageCount || null,
        status: 'reading',
      });
      setAddedBook(book);
    } catch { /* non-fatal */ }
    setSaving(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
        ))}
      </View>

      {/* Skip button (hidden on last step) */}
      {step < totalSteps - 1 && (
        <TouchableOpacity style={[styles.skipBtn, { top: insets.top + 12 }]} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {step === 0 && <WelcomeStep />}
        {step === 1 && <TourStep />}
        {step === 2 && (
          <GoalStep
            goal={goal} setGoal={setGoal}
            customGoal={customGoal} setCustomGoal={setCustomGoal}
            useCustom={useCustom} setUseCustom={setUseCustom}
          />
        )}
        {step === 3 && (
          <BookStep
            query={bookQuery} setQuery={setBookQuery}
            results={bookResults} onSearch={searchBooks}
            onAdd={handleAddBook} addedBook={addedBook}
            searching={bookSearching} saving={saving}
          />
        )}
        {step === 4 && <DoneStep />}
      </Animated.View>

      {/* CTA button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleNext}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={colors.onPrimary} />
            : <Text style={styles.primaryBtnText}>{step === totalSteps - 1 ? 'Start Reading' : 'Continue'}</Text>
          }
        </TouchableOpacity>
        {step >= 2 && step < totalSteps - 1 && (
          <TouchableOpacity onPress={handleSkip} style={styles.skipLinkBtn}>
            <Text style={styles.skipLinkText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Step: Welcome ─────────────────────────────────────────────────────────────
function WelcomeStep() {
  return (
    <View style={styles.stepCenter}>
      <Text style={styles.bigEmoji}>📖</Text>
      <Text style={styles.stepTitle}>Welcome to{'\n'}TrackMyRead</Text>
      <Text style={styles.stepDesc}>
        Your social home for books. Track every read, share your journey, and discover what your friends are loving.
      </Text>
      <View style={styles.pillRow}>
        {['📚 Track', '✍️ Reflect', '👥 Connect'].map(p => (
          <View key={p} style={styles.pill}>
            <Text style={styles.pillText}>{p}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Step: App Tour ────────────────────────────────────────────────────────────
function TourStep() {
  return (
    <View style={styles.tourWrap}>
      <Text style={styles.stepTitleSm}>What's inside</Text>
      <Text style={styles.stepDescSm}>Four powerful tools, one beautiful app.</Text>
      <View style={styles.tourGrid}>
        {TABS.map(tab => (
          <View key={tab.label} style={[styles.tourCard, { backgroundColor: tab.bg }]}>
            <View style={[styles.tourIconBox, { backgroundColor: tab.color + '18' }]}>
              <MaterialCommunityIcons name={tab.icon} size={26} color={tab.color} />
            </View>
            <Text style={[styles.tourLabel, { color: tab.color }]}>{tab.label}</Text>
            <Text style={styles.tourHeadline}>{tab.headline}</Text>
            <Text style={styles.tourDesc}>{tab.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Step: Reading Goal ────────────────────────────────────────────────────────
function GoalStep({ goal, setGoal, customGoal, setCustomGoal, useCustom, setUseCustom }) {
  return (
    <View style={styles.stepCenter}>
      <Text style={styles.bigEmoji}>🎯</Text>
      <Text style={styles.stepTitle}>Set a Reading Goal</Text>
      <Text style={styles.stepDesc}>How many books do you want to finish this year? You can always change this later.</Text>
      <View style={styles.presetRow}>
        {GOAL_PRESETS.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.presetChip, !useCustom && goal === p && styles.presetChipActive]}
            onPress={() => { setGoal(p); setUseCustom(false); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.presetNum, !useCustom && goal === p && styles.presetNumActive]}>{p}</Text>
            <Text style={[styles.presetLabel, !useCustom && goal === p && styles.presetLabelActive]}>books</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.customRow}>
        <TouchableOpacity
          style={[styles.customToggle, useCustom && styles.customToggleActive]}
          onPress={() => setUseCustom(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.customToggleText, useCustom && styles.customToggleTextActive]}>Custom</Text>
        </TouchableOpacity>
        {useCustom && (
          <TextInput
            style={styles.customInput}
            value={customGoal}
            onChangeText={setCustomGoal}
            keyboardType="number-pad"
            placeholder="e.g. 20"
            placeholderTextColor={colors.outline}
            maxLength={3}
            autoFocus
          />
        )}
      </View>
      {!useCustom && (
        <Text style={styles.goalPreview}>
          That's about <Text style={styles.goalHighlight}>{(goal / 12).toFixed(1)} books/month</Text>
        </Text>
      )}
    </View>
  );
}

// ── Step: Add First Book ──────────────────────────────────────────────────────
function BookStep({ query, setQuery, results, onSearch, onAdd, addedBook, searching, saving }) {
  if (addedBook) {
    return (
      <View style={styles.stepCenter}>
        <Text style={styles.bigEmoji}>🎉</Text>
        <Text style={styles.stepTitle}>Book Added!</Text>
        <Text style={styles.stepDesc}>
          <Text style={{ fontWeight: '700', color: colors.primary }}>{addedBook.title}</Text>
          {' '}is now in your library. You're off to a great start!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.bookWrap}>
      <Text style={styles.stepTitleSm}>Add your first book</Text>
      <Text style={styles.stepDescSm}>Search for something you're currently reading or want to start.</Text>
      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.outline} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={(t) => { setQuery(t); onSearch(t); }}
          placeholder="Search by title or author…"
          placeholderTextColor={colors.outline}
          returnKeyType="search"
          onSubmitEditing={() => onSearch(query)}
        />
        {searching && <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 10 }} />}
      </View>
      {results.length > 0 && (
        <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {results.map((book, idx) => (
            <TouchableOpacity
              key={book.google_id || book.id || idx}
              style={styles.resultRow}
              onPress={() => onAdd(book)}
              activeOpacity={0.75}
              disabled={saving}
            >
              {book.cover_url || book.thumbnail ? (
                <Image
                  source={{ uri: book.cover_url || book.thumbnail }}
                  style={styles.resultCover}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.resultCover, styles.resultCoverPlaceholder]}>
                  <MaterialCommunityIcons name="book" size={20} color={colors.outline} />
                </View>
              )}
              <View style={styles.resultInfo}>
                <Text style={styles.resultTitle} numberOfLines={2}>{book.title}</Text>
                <Text style={styles.resultAuthor} numberOfLines={1}>
                  {book.author || (Array.isArray(book.authors) ? book.authors.join(', ') : '')}
                </Text>
              </View>
              <View style={styles.addChip}>
                <Text style={styles.addChipText}>Add</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {results.length === 0 && query.length < 2 && (
        <View style={styles.bookPrompt}>
          <MaterialCommunityIcons name="book-search-outline" size={48} color={colors.outlineVariant} />
          <Text style={styles.bookPromptText}>Type a title or author name to search</Text>
        </View>
      )}
    </View>
  );
}

// ── Step: Done ────────────────────────────────────────────────────────────────
function DoneStep() {
  return (
    <View style={styles.stepCenter}>
      <Text style={styles.bigEmoji}>🌟</Text>
      <Text style={styles.stepTitle}>You're all set!</Text>
      <Text style={styles.stepDesc}>
        Your reading journey begins now. Explore the app, add books, follow friends, and start logging your reading.
      </Text>
      <View style={styles.doneCards}>
        {[
          { icon: 'bookshelf', text: 'Browse your Library' },
          { icon: 'newspaper-variant-outline', text: 'Check the Feed' },
          { icon: 'account-group-outline', text: 'Join a Circle' },
        ].map(item => (
          <View key={item.text} style={styles.doneCard}>
            <MaterialCommunityIcons name={item.icon} size={22} color={colors.primary} />
            <Text style={styles.doneCardText}>{item.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  // Progress dots
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 16,
    paddingBottom: 4,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.outlineVariant,
  },
  dotActive: {
    width: 22, backgroundColor: colors.primary,
  },
  dotDone: {
    backgroundColor: colors.primary + '60',
  },

  // Skip
  skipBtn: {
    position: 'absolute', right: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    zIndex: 10,
  },
  skipText: {
    fontSize: 14, fontWeight: '500', color: colors.onSurfaceVariant,
  },

  // Content area
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },

  // Footer CTA
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  primaryBtnText: {
    fontSize: 16, fontWeight: '700', color: colors.onPrimary,
  },
  skipLinkBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipLinkText: {
    fontSize: 13, fontWeight: '500', color: colors.outline,
  },

  // ── Welcome ────────────────────────────────────────────────────────────────
  stepCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  bigEmoji: {
    fontSize: 72,
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
  },
  stepDesc: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pill: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: {
    fontSize: 13, fontWeight: '600', color: colors.onSurface,
  },

  // ── Tour ───────────────────────────────────────────────────────────────────
  tourWrap: {
    flex: 1,
    paddingBottom: 12,
  },
  stepTitleSm: {
    fontSize: 22, fontWeight: '700', color: colors.primary,
    marginBottom: 4,
  },
  stepDescSm: {
    fontSize: 14, fontWeight: '400', color: colors.onSurfaceVariant,
    marginBottom: 16, lineHeight: 20,
  },
  tourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tourCard: {
    width: (SW - 48 - 10) / 2,
    borderRadius: radius.lg,
    padding: 14,
    gap: 4,
    ...shadow.card,
  },
  tourIconBox: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  tourLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  tourHeadline: {
    fontSize: 15, fontWeight: '700', color: colors.onSurface,
  },
  tourDesc: {
    fontSize: 12, fontWeight: '400', color: colors.onSurfaceVariant,
    lineHeight: 18,
  },

  // ── Goal ───────────────────────────────────────────────────────────────────
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 16,
  },
  presetChip: {
    width: 64,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    gap: 2,
  },
  presetChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  presetNum: {
    fontSize: 18, fontWeight: '700', color: colors.onSurface,
  },
  presetNumActive: {
    color: colors.onPrimary,
  },
  presetLabel: {
    fontSize: 10, fontWeight: '500', color: colors.outline,
  },
  presetLabelActive: {
    color: 'rgba(255,255,255,0.75)',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  customToggle: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  customToggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  customToggleText: {
    fontSize: 13, fontWeight: '600', color: colors.onSurfaceVariant,
  },
  customToggleTextActive: {
    color: colors.primary,
  },
  customInput: {
    flex: 1,
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 18, fontWeight: '700', color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
    textAlign: 'center',
  },
  goalPreview: {
    fontSize: 13, fontWeight: '400', color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  goalHighlight: {
    fontWeight: '700', color: colors.primary,
  },

  // ── Book Search ────────────────────────────────────────────────────────────
  bookWrap: {
    flex: 1,
    paddingBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
    marginBottom: 12,
    paddingLeft: 4,
  },
  searchIcon: {
    marginLeft: 8, marginRight: 4,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12, paddingRight: 12,
    fontSize: 14, fontWeight: '400', color: colors.onSurface,
  },
  resultsList: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '50',
  },
  resultCover: {
    width: 40, height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHigh,
  },
  resultCoverPlaceholder: {
    alignItems: 'center', justifyContent: 'center',
  },
  resultInfo: {
    flex: 1, gap: 2,
  },
  resultTitle: {
    fontSize: 13, fontWeight: '600', color: colors.onSurface, lineHeight: 18,
  },
  resultAuthor: {
    fontSize: 12, fontWeight: '400', color: colors.onSurfaceVariant,
  },
  addChip: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  addChipText: {
    fontSize: 12, fontWeight: '700', color: colors.onPrimary,
  },
  bookPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    opacity: 0.6,
  },
  bookPromptText: {
    fontSize: 13, fontWeight: '400', color: colors.onSurfaceVariant,
    textAlign: 'center',
  },

  // ── Done ───────────────────────────────────────────────────────────────────
  doneCards: {
    width: '100%',
    gap: 8,
  },
  doneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1, borderColor: colors.outlineVariant + '60',
  },
  doneCardText: {
    fontSize: 14, fontWeight: '600', color: colors.onSurface,
  },
});
