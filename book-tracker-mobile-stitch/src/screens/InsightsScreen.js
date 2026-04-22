import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity, Image, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { activityAPI, userbooksAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

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
function StatCard({ label, value, icon, accent, wide }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent, wide && styles.statCardWide]}>
      <Ionicons name={icon} size={18} color={accent ? colors.onPrimary : colors.primary} style={{ marginBottom: 6 }} />
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value ?? '—'}</Text>
      <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
    </View>
  );
}

// ── Insights Screen ────────────────────────────────────────────────────────────
export default function InsightsScreen({ navigation }) {
  const [insights, setInsights]   = useState(null);
  const [activity, setActivity]   = useState([]);
  const [books, setBooks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [ins, act, bks] = await Promise.allSettled([
        activityAPI.getInsights(),
        activityAPI.getMyActivity(30),
        userbooksAPI.getMyBooks(),
      ]);
      if (ins.status === 'fulfilled') setInsights(ins.value);
      if (act.status === 'fulfilled') setActivity(act.value || []);
      if (bks.status === 'fulfilled') setBooks(bks.value || []);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const streak     = insights?.current_streak  || 0;
  const bestStreak = insights?.longest_streak  || 0;
  const totalBooks = insights?.total_books     ?? books.length;
  const finished   = insights?.finished_books  ?? books.filter(b => b.status === 'finished').length;
  const pagesRead  = insights?.total_pages_read ?? 0;
  const avgRating  = insights?.average_rating  ?? null;
  const avgPpd     = insights?.avg_pages_per_day ?? null;
  const yearGoal   = insights?.yearly_goal;
  const projected  = insights?.projected_finishes || [];

  // Monthly chart — last 12 months pages
  const monthly    = insights?.monthly_pages || [];

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

  // Reading books for projected finishes
  const readingBooks = books.filter(b => b.status === 'reading');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>YOUR READING LIFE</Text>
        <Text style={styles.headerTitle}>Insights</Text>
        <Text style={styles.headerSub}>Quantified.</Text>
      </View>

      {/* ── Stats grid ── */}
      <View style={styles.statsGrid}>
        <StatCard label="Total Books"  value={fmt(totalBooks)} icon="library-outline" />
        <StatCard label="Finished"     value={fmt(finished)}   icon="checkmark-circle-outline" accent />
        <StatCard label="Pages Read"   value={fmt(pagesRead)}  icon="book-outline" />
        <StatCard label="Avg Rating"   value={avgRating ? avgRating.toFixed(1) : '—'} icon="star-outline" />
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Avg Pages / Day" value={avgPpd ? Math.round(avgPpd).toString() : '—'} icon="trending-up-outline" />
        <StatCard label="Streak (days)"   value={streak > 0 ? `🔥 ${streak}` : '—'}            icon="flame-outline" />
        <StatCard label="Best Streak"     value={bestStreak > 0 ? `${bestStreak}d` : '—'}       icon="trophy-outline" />
      </View>

      {/* ── Streak + Goal row ── */}
      <View style={styles.row}>
        {/* Streak card */}
        <View style={[styles.card, { flex: 1 }]}>
          <Text style={styles.cardTitle}>Reading Streak</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginVertical: 6 }}>
            <Text style={styles.bigNumber}>{streak}</Text>
            <Text style={styles.bigUnit}>days</Text>
          </View>
          {streak >= 7 && (
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>
              🔥 {streak >= 30 ? 'On fire!' : streak >= 14 ? 'Two weeks strong!' : 'Keep it up!'}
            </Text>
          )}
          {bestStreak > streak && bestStreak > 0 && (
            <Text style={styles.cardSub}>Best: {bestStreak} days</Text>
          )}
        </View>

        {/* Yearly goal */}
        {yearGoal ? (
          <View style={[styles.card, { flex: 1, alignItems: 'center' }]}>
            <Text style={styles.cardTitle}>{new Date().getFullYear()} Goal</Text>
            <GoalRing pct={goalPct} size={72} stroke={8} color={onTrack ? colors.primary : colors.secondary}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.onSurface }}>{goalPct}%</Text>
            </GoalRing>
            <Text style={[styles.goalStatus, { color: onTrack ? colors.primary : colors.secondary }]}>
              {onTrack ? 'On track' : 'Behind pace'}
            </Text>
            <Text style={styles.cardSub}>{goalFinished} / {goalTarget} books</Text>
          </View>
        ) : (
          <View style={[styles.card, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="flag-outline" size={32} color={colors.outlineVariant} />
            <Text style={[styles.cardSub, { textAlign: 'center', marginTop: 8 }]}>Set a yearly goal in Settings</Text>
          </View>
        )}
      </View>

      {/* ── 30-Day Activity chart ── */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>30-Day Activity</Text>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>🔥 {streak} day streak</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardSub}>Daily pages read</Text>
        {activityBars.length > 0 ? (
          <>
            <View style={{ marginTop: 14 }}>
              <BarChart data={activityBars} height={90} />
            </View>
            <View style={styles.chartAxis}>
              <Text style={styles.chartAxisLabel}>30 days ago</Text>
              <Text style={styles.chartAxisLabel}>Today</Text>
            </View>
          </>
        ) : (
          <Text style={[styles.cardSub, { marginTop: 12 }]}>No activity data yet. Start logging pages!</Text>
        )}
      </View>

      {/* ── Monthly pages chart ── */}
      {monthly.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pages per Month</Text>
          <Text style={styles.cardSub}>Last 12 months</Text>
          <View style={{ marginTop: 14 }}>
            <BarChart
              data={monthly.map((m, i) => ({ value: m.pages || 0, isToday: i === monthly.length - 1 }))}
              height={90}
            />
          </View>
          <View style={[styles.chartAxis, { marginTop: 6 }]}>
            {monthly.length > 0 && (
              <>
                <Text style={styles.chartAxisLabel}>{shortMonth(monthly[0]?.month)}</Text>
                <Text style={styles.chartAxisLabel}>{shortMonth(monthly[monthly.length - 1]?.month)}</Text>
              </>
            )}
          </View>
        </View>
      )}

      {/* ── Projected finishes ── */}
      {readingBooks.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Projected Finishes</Text>
          <Text style={styles.cardSub}>Based on your reading pace</Text>
          <View style={{ marginTop: 14, gap: 14 }}>
            {readingBooks.map(ub => {
              const book     = ub.book;
              const cur      = ub.current_page || 0;
              const total    = book?.total_pages || 0;
              const pct      = total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0;
              const proj     = projected.find(p => p.userbook_id === ub.id);
              const dl       = proj ? daysLeft(proj.projected_finish_date) : null;
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
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.projTitle} numberOfLines={2}>{book?.title || 'Unknown'}</Text>
                    <View style={styles.projProgress}>
                      <View style={styles.projTrack}>
                        <View style={[styles.projFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.projPct}>{pct}%</Text>
                    </View>
                    <Text style={styles.projMeta}>
                      {cur} / {total || '?'} pages
                      {proj?.projected_finish_date ? `  ·  Finishes ${shortDate(proj.projected_finish_date)}` : ''}
                      {dl ? `  ·  ${dl}d left` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content:   { padding: 16, gap: 12 },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:      { paddingTop: 40, paddingBottom: 8 },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.secondary, marginBottom: 2 },
  headerTitle: { fontSize: 30, fontWeight: '800', color: colors.primary, lineHeight: 36 },
  headerSub:   { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 2 },

  statsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  statCard:  {
    flex: 1, minWidth: (SCREEN_W - 48) / 2 - 5,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg, padding: 14, ...shadow.card,
    alignItems: 'flex-start',
  },
  statCardAccent: { backgroundColor: colors.primary },
  statCardWide:   { minWidth: '100%' },
  statValue:      { fontSize: 22, fontWeight: '800', color: colors.onSurface, lineHeight: 26 },
  statValueAccent:{ color: colors.onPrimary },
  statLabel:      { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },
  statLabelAccent:{ color: colors.onPrimary + 'cc' },

  row:  { flexDirection: 'row', gap: 12 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 16, ...shadow.card },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardTitle:    { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  cardSub:      { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },

  bigNumber: { fontSize: 36, fontWeight: '800', color: colors.onSurface },
  bigUnit:   { fontSize: 14, color: colors.onSurfaceVariant },

  goalStatus: { fontSize: 12, fontWeight: '700', marginTop: 6 },

  streakBadge: { backgroundColor: colors.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  streakBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  chartAxis:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  chartAxisLabel: { fontSize: 10, color: colors.outline },

  projRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  projCover:   { width: 44, height: 64, borderRadius: radius.sm },
  projTitle:   { fontSize: 13, fontWeight: '700', color: colors.onSurface, lineHeight: 18 },
  projProgress:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  projTrack:   { flex: 1, height: 4, backgroundColor: colors.surfaceContainerHigh, borderRadius: 2, overflow: 'hidden' },
  projFill:    { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  projPct:     { fontSize: 10, fontWeight: '700', color: colors.primary, width: 28 },
  projMeta:    { fontSize: 11, color: colors.outline },
});
