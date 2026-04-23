import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity, Image, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { activityAPI, userbooksAPI, profileAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';
import AppHeader from '../components/AppHeader';

const SCREEN_W = Dimensions.get('window').width;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  if (!n && n !== 0) return '—';
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function shortMonth(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en', { month: 'short' });
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - Date.now()) / 86_400_000);
  return diff > 0 ? diff : null;
}

// ── Circular progress ring (pure View) ────────────────────────────────────────
function GoalRing({ pct = 0, size = 80, stroke = 9, color = colors.primary, children }) {
  // Two-semicircle technique: clip left/right halves and rotate them
  const r    = size / 2;
  const half = r - stroke / 2;
  const deg  = Math.min(360, (pct / 100) * 360);

  // left half shows 0-180 deg of progress, right half shows 180-360
  const rightDeg = Math.min(180, deg);
  const leftDeg  = Math.max(0, deg - 180);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track */}
      <View style={{
        position: 'absolute', width: size, height: size, borderRadius: r,
        borderWidth: stroke, borderColor: colors.surfaceContainerHigh,
      }} />

      {/* Right arc (0-180°) */}
      <View style={{
        position: 'absolute', width: size, height: size,
        overflow: 'hidden', // clip to right half
      }}>
        <View style={{
          position: 'absolute', right: 0, width: r, height: size, overflow: 'hidden',
        }}>
          <View style={{
            position: 'absolute', left: -r, width: size, height: size,
            borderRadius: r, borderWidth: stroke, borderColor: color,
            transform: [{ rotate: `${rightDeg - 180}deg` }],
          }} />
        </View>
      </View>

      {/* Left arc (180-360°) */}
      {leftDeg > 0 && (
        <View style={{ position: 'absolute', width: size, height: size, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, width: r, height: size, overflow: 'hidden' }}>
            <View style={{
              position: 'absolute', right: -r, width: size, height: size,
              borderRadius: r, borderWidth: stroke, borderColor: color,
              transform: [{ rotate: `${leftDeg - 180}deg` }],
            }} />
          </View>
        </View>
      )}

      {/* Center content */}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart({ data, height = 100, barColor = colors.primary, highlightColor = colors.primaryContainer, highlightIndex }) {
  if (!data || data.length === 0) return null;
  const max   = Math.max(...data.map(d => d.value || 0), 1);
  const barW  = Math.max(3, Math.floor((SCREEN_W - 48) / data.length) - 2);

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
      {data.map((d, i) => {
        const h = Math.max(2, Math.round(((d.value || 0) / max) * (height - 4)));
        const isHighlight = i === highlightIndex || d.isToday;
        return (
          <View
            key={i}
            style={{
              width: barW,
              height: h,
              backgroundColor: d.value > 0
                ? (isHighlight ? colors.onSurface : barColor)
                : colors.surfaceContainerHigh,
              borderRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, accent, wide }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent, wide && styles.statCardWide]}>
      <View style={styles.statCardTop}>
        <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label.toUpperCase()}</Text>
        <Ionicons name={icon} size={16} color={accent ? colors.onPrimary + 'aa' : colors.onSurfaceVariant} />
      </View>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value ?? '—'}</Text>
      {sub ? <Text style={[styles.statSub, accent && styles.statSubAccent]}>{sub}</Text> : null}
    </View>
  );
}

// ── Insights Screen ────────────────────────────────────────────────────────────
export default function InsightsScreen({ navigation }) {
  const [insights, setInsights]   = useState(null);
  const [activity, setActivity]   = useState([]);
  const [books, setBooks]         = useState([]);
  const [user, setUser]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [ins, act, bks, usr] = await Promise.allSettled([
        activityAPI.getInsights(),
        activityAPI.getMyActivity(30),
        userbooksAPI.getMyBooks(),
        profileAPI.getMe(),
      ]);
      if (ins.status === 'fulfilled') setInsights(ins.value);
      if (act.status === 'fulfilled') setActivity(act.value || []);
      if (bks.status === 'fulfilled') setBooks(bks.value || []);
      if (usr.status === 'fulfilled') setUser(usr.value);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const streak          = insights?.current_streak     || 0;
  const bestStreak      = insights?.longest_streak     || 0;
  const totalBooks      = insights?.total_books        ?? books.length;
  const finished        = insights?.finished_books     ?? books.filter(b => b.status === 'finished').length;
  const pagesRead       = insights?.total_pages_read   ?? 0;
  const avgRating       = insights?.average_rating     ?? null;
  const avgPpd          = insights?.avg_pages_per_day  ?? null;
  const yearGoal        = insights?.yearly_goal;
  const projected       = insights?.projected_finishes || [];
  const booksThisYear   = insights?.books_this_year    ?? insights?.books_finished_this_year ?? null;
  const readingBooks    = books.filter(b => b.status === 'reading');
  const currentlyReading = readingBooks.length;

  // Monthly chart — last 12 months pages
  const monthly = insights?.monthly_pages || [];

  // 30-day activity bars
  const activityBars = activity.map((d, i) => ({
    value: d.pages_read || 0,
    isToday: i === activity.length - 1,
  }));

  // Yearly goal ring
  let goalPct = 0;
  let goalFinished = 0;
  let goalTarget = 0;
  if (yearGoal) {
    goalFinished = yearGoal.finished || 0;
    goalTarget   = yearGoal.goal     || 1;
    goalPct      = Math.min(100, Math.round((goalFinished / goalTarget) * 100));
  }
  const onTrack = yearGoal?.on_track;

  return (
    <View style={styles.container}>
      <AppHeader
        user={user}
        onBellPress={() => navigation?.navigate('Notifications')}
        onAvatarPress={() => navigation?.navigate('Profile')}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>YOUR READING LIFE</Text>
          <Text style={styles.headerTitle}>Reading Insights</Text>
          <Text style={styles.headerSub}>Your reading life, quantified.</Text>
        </View>

        {/* ── Stats grid row 1: Total Books | Finished ── */}
        <View style={styles.statsGrid}>
          <StatCard label="Total Books" value={fmt(totalBooks)} icon="library-outline" />
          <StatCard label="Finished"    value={fmt(finished)}   icon="checkmark-circle-outline" accent />
        </View>

        {/* ── Stats grid row 2: Pages Read | Avg Rating ── */}
        <View style={styles.statsGrid}>
          <StatCard label="Pages Read" value={fmt(pagesRead)} icon="book-outline" />
          <StatCard
            label="Avg Rating"
            value={avgRating ? avgRating.toFixed(1) : '—'}
            sub={!avgRating ? 'rate your finished books' : undefined}
            icon="star-outline"
          />
        </View>

        {/* ── Stats grid row 3: Avg Pages/Day | This Year ── */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Avg Pages / Day"
            value={avgPpd ? Math.round(avgPpd).toString() : '—'}
            sub="last 30 days"
            icon="trending-up-outline"
          />
          <StatCard
            label="This Year"
            value={booksThisYear != null ? String(booksThisYear) : fmt(finished)}
            sub={`books finished in ${new Date().getFullYear()}`}
            icon="calendar-outline"
          />
        </View>

        {/* ── Currently Reading — full width ── */}
        <StatCard
          label="Currently Reading"
          value={String(currentlyReading)}
          sub="books in progress"
          icon="reader-outline"
          wide
        />

        {/* ── Reading Streak ── */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>READING STREAK</Text>
          <View style={styles.streakRow}>
            <View style={styles.streakHalf}>
              <Text style={styles.streakIcon}>🔥</Text>
              <Text style={styles.bigNumber}>{streak}</Text>
              <Text style={styles.streakUnit}>current streak{'\n'}days</Text>
            </View>
            <View style={styles.streakDivider} />
            <View style={styles.streakHalf}>
              <Text style={styles.bigNumber}>{bestStreak || 1}</Text>
              <Text style={styles.streakUnit}>longest ever{'\n'}day</Text>
            </View>
          </View>
        </View>

        {/* ── Yearly goal ── */}
        {yearGoal ? (
          <View style={styles.card}>
            <View style={styles.goalHeader}>
              <Text style={styles.cardEyebrow}>YEARLY GOAL</Text>
              <View style={[styles.onTrackBadge, !onTrack && styles.behindBadge]}>
                <Text style={[styles.onTrackText, !onTrack && styles.behindText]}>
                  {onTrack ? 'On track' : 'Behind pace'}
                </Text>
              </View>
            </View>
            <View style={styles.goalBody}>
              <GoalRing pct={goalPct} size={90} stroke={10} color={onTrack ? colors.primary : colors.secondary}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.onSurface }}>{goalPct}%</Text>
              </GoalRing>
              <View style={styles.goalText}>
                <Text style={styles.goalBooksNum}>{goalFinished}</Text>
                <Text style={styles.goalBooksOf}>of {goalTarget} books</Text>
                <Text style={styles.goalBooksLeft}>{Math.max(0, goalTarget - goalFinished)} to go</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.card, styles.goalEmpty]}>
            <Ionicons name="flag-outline" size={32} color={colors.outlineVariant} />
            <Text style={styles.cardSub}>Set a yearly goal in Settings</Text>
          </View>
        )}

        {/* ── Monthly pages chart ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monthly Pages Read</Text>
          {monthly.length > 0 ? (
            <>
              <View style={{ marginTop: 14 }}>
                <BarChart
                  data={monthly.map((m, i) => ({ value: m.pages || 0, isToday: i === monthly.length - 1 }))}
                  height={90}
                />
              </View>
              <View style={[styles.chartAxis, { marginTop: 6 }]}>
                <Text style={styles.chartAxisLabel}>{shortMonth(monthly[0]?.month)}</Text>
                <Text style={styles.chartAxisLabel}>{shortMonth(monthly[monthly.length - 1]?.month)}</Text>
              </View>
            </>
          ) : (
            <Text style={[styles.cardSub, { marginTop: 12 }]}>No monthly data yet.</Text>
          )}
        </View>

        {/* ── Projected finish dates ── */}
        {readingBooks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>PROJECTED FINISH DATES</Text>
            <View style={{ gap: 12, marginTop: 10 }}>
              {readingBooks.map(ub => {
                const book  = ub.book;
                const cur   = ub.current_page || 0;
                const total = book?.total_pages || 0;
                const pct   = total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0;
                const proj  = projected.find(p => p.userbook_id === ub.id);
                const dl    = proj ? daysLeft(proj.projected_finish_date) : null;
                return (
                  <TouchableOpacity
                    key={ub.id}
                    style={styles.projRow}
                    onPress={() => navigation?.navigate('BookDetail', { userbook: ub, userbookId: ub.id })}
                    activeOpacity={0.8}
                  >
                    {book?.cover_url ? (
                      <Image source={{ uri: book.cover_url }} style={styles.projCover} />
                    ) : (
                      <View style={[styles.projCover, { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="book-outline" size={20} color={colors.outline} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.projTitle} numberOfLines={1}>{book?.title || 'Unknown'}</Text>
                      <Text style={styles.projPages}>{cur} / {total || '?'} pages</Text>
                      <View style={styles.projProgress}>
                        <View style={styles.projTrack}>
                          <View style={[styles.projFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={styles.projPct}>{pct}%</Text>
                      </View>
                    </View>
                    {proj?.projected_finish_date && (
                      <View style={styles.projDate}>
                        <Text style={styles.projDateText}>{shortDate(proj.projected_finish_date)}</Text>
                        {dl ? <Text style={styles.projDaysLeft}>{dl}d left</Text> : null}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content:   { padding: 16, gap: 12 },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:      { paddingBottom: 4 },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.secondary, marginBottom: 2 },
  headerTitle: { fontSize: 30, fontWeight: '800', color: colors.onSurface, lineHeight: 36 },
  headerSub:   { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 2 },

  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard:  {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg, padding: 14, ...shadow.card,
  },
  statCardAccent: { backgroundColor: colors.primary },
  statCardWide:   { flex: undefined },
  statCardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  statValue:      { fontSize: 24, fontWeight: '800', color: colors.onSurface, lineHeight: 28 },
  statValueAccent:{ color: colors.onPrimary },
  statLabel:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.onSurfaceVariant },
  statLabelAccent:{ color: colors.onPrimary + 'cc' },
  statSub:        { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 3 },
  statSubAccent:  { color: colors.onPrimary + 'aa' },

  card:         { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 16, ...shadow.card },
  cardEyebrow:  { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.secondary, marginBottom: 10 },
  cardTitle:    { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  cardSub:      { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },

  // Streak
  streakRow:    { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  streakHalf:   { flex: 1, alignItems: 'flex-start' },
  streakIcon:   { fontSize: 20, marginBottom: 2 },
  streakDivider:{ width: 1, backgroundColor: colors.outlineVariant, alignSelf: 'stretch', marginHorizontal: 16 },
  streakUnit:   { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2, lineHeight: 16 },
  bigNumber:    { fontSize: 38, fontWeight: '900', color: colors.onSurface, lineHeight: 44 },

  // Goal
  goalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  goalBody:     { flexDirection: 'row', alignItems: 'center', gap: 20 },
  goalText:     { flex: 1 },
  goalBooksNum: { fontSize: 32, fontWeight: '900', color: colors.primary, lineHeight: 36 },
  goalBooksOf:  { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 2 },
  goalBooksLeft:{ fontSize: 12, color: colors.outline, marginTop: 2 },
  onTrackBadge: { backgroundColor: colors.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  onTrackText:  { fontSize: 12, fontWeight: '700', color: colors.primary },
  behindBadge:  { backgroundColor: colors.secondary + '18' },
  behindText:   { color: colors.secondary },
  goalEmpty:    { alignItems: 'center', gap: 8, paddingVertical: 20 },

  chartAxis:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  chartAxisLabel: { fontSize: 10, color: colors.outline },

  // Projected finishes
  projRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, padding: 12 },
  projCover:    { width: 52, height: 78, borderRadius: radius.sm },
  projTitle:    { fontSize: 14, fontWeight: '700', color: colors.onSurface, lineHeight: 18, marginBottom: 2 },
  projPages:    { fontSize: 11, color: colors.onSurfaceVariant, marginBottom: 6 },
  projProgress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  projTrack:    { flex: 1, height: 4, backgroundColor: colors.surfaceContainerHigh, borderRadius: 2, overflow: 'hidden' },
  projFill:     { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  projPct:      { fontSize: 11, fontWeight: '700', color: colors.primary, width: 30, textAlign: 'right' },
  projDate:     { alignItems: 'flex-end', minWidth: 54 },
  projDateText: { fontSize: 13, fontWeight: '700', color: colors.secondary },
  projDaysLeft: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },
});
