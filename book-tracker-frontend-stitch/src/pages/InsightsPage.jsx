import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { getReadingInsights } from '../services/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function monthLabel(key) {
  // key: "2025-04"
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1).toLocaleString('default', { month: 'short' })
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent = false }) {
  return (
    <div className={`rounded-2xl p-5 space-y-1 ${accent ? 'bg-primary text-on-primary' : 'bg-surface-container-low'}`}>
      <div className="flex items-center justify-between">
        <p className={`text-[10px] font-bold uppercase tracking-widest ${accent ? 'text-on-primary/70' : 'text-on-surface-variant/60'}`}>{label}</p>
        {icon && <span className={`material-symbols-outlined text-lg ${accent ? 'text-on-primary/70' : 'text-on-surface-variant/40'}`}>{icon}</span>}
      </div>
      <p className={`text-3xl font-bold font-serif leading-none ${accent ? 'text-on-primary' : 'text-on-surface'}`}>{value}</p>
      {sub && <p className={`text-xs ${accent ? 'text-on-primary/70' : 'text-on-surface-variant/60'}`}>{sub}</p>}
    </div>
  )
}

// ─── Monthly Bar Chart ────────────────────────────────────────────────────────

function MonthlyChart({ data }) {
  const { t } = useTranslation()
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.pages_read), 1)
  const currentMonth = new Date().toLocaleString('default', { month: 'short' })

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('insights.monthlyPagesRead')}</p>
      <div className="flex items-end gap-1 h-28">
        {data.map((d, i) => {
          const h = (d.pages_read / max) * 100
          const label = monthLabel(d.month)
          const isCurrentMonth = label === currentMonth
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
              {d.pages_read > 0 && (
                <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-on-surface text-surface text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                  {d.pages_read}p
                </div>
              )}
              <div
                className={`w-full rounded-t-sm transition-all ${
                  isCurrentMonth ? 'bg-secondary' : d.pages_read > 0 ? 'bg-primary/40' : 'bg-surface-container-high'
                }`}
                style={{ height: `${Math.max(h, d.pages_read > 0 ? 6 : 3)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[9px] text-on-surface-variant/40 font-medium truncate">
            {monthLabel(d.month)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Streak Flame ────────────────────────────────────────────────────────────

function StreakBadge({ current, longest }) {
  const { t } = useTranslation()
  const streakLabel = t('insights.currentStreakDays').split('\n')
  const longestLabel = t('insights.longestEverDay').split('\n')
  return (
    <div className="bg-surface-container-low rounded-2xl p-5 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('insights.readingStreak')}</p>
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="flex items-center gap-1 justify-center">
            <span className="material-symbols-outlined text-2xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
            <span className="text-4xl font-bold font-serif text-on-surface">{current}</span>
          </div>
          <p className="text-xs text-on-surface-variant/60 mt-1">{streakLabel[0]}</p>
          <p className="text-[10px] text-on-surface-variant/40">{streakLabel[1]}</p>
        </div>
        <div className="w-px h-12 bg-outline-variant/20" />
        <div className="text-center">
          <span className="text-2xl font-bold font-serif text-on-surface">{longest}</span>
          <p className="text-xs text-on-surface-variant/60 mt-1">{longestLabel[0]}</p>
          <p className="text-[10px] text-on-surface-variant/40">{longestLabel[1]}</p>
        </div>
      </div>
      {current >= 7 && (
        <p className="text-xs text-secondary font-medium">
          {current >= 30 ? '🏆 Incredible! 30+ day streak!' : current >= 14 ? '🔥 Two weeks strong!' : '✨ One week streak!'}
        </p>
      )}
    </div>
  )
}

// ─── Yearly Goal Ring ─────────────────────────────────────────────────────────

function YearlyGoalRing({ goal }) {
  const { t } = useTranslation()
  if (!goal) return null
  const r = 42
  const circ = 2 * Math.PI * r
  const pct = goal.pct / 100
  const dash = circ * pct
  const gap  = circ - dash

  return (
    <div className="bg-surface-container-low rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('insights.yearlyGoal')}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${goal.on_track ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
          {goal.on_track ? t('insights.onTrack') : t('insights.behindPace')}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-container-high" />
            <circle
              cx="50" cy="50" r={r} fill="none"
              stroke="currentColor" strokeWidth="8"
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              className="text-primary transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold font-serif text-on-surface">{goal.pct}%</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-bold font-serif text-on-surface">{goal.completed}</p>
          <p className="text-sm text-on-surface-variant">{t('insights.ofGoalBooks', { goal: goal.goal })}</p>
          <p className="text-xs text-on-surface-variant/50">{t('insights.toGo', { remaining: goal.goal - goal.completed })}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Projected Finishes ───────────────────────────────────────────────────────

function ProjectedFinishes({ items }) {
  const { t } = useTranslation()
  if (!items?.length) return null
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('insights.projectedFinishDates')}</p>
      <div className="space-y-3">
        {items.map(p => (
          <div key={p.userbook_id} className="flex items-center gap-4 bg-surface-container-low rounded-2xl p-4">
            {p.cover_url ? (
              <img src={p.cover_url} alt={p.title} className="w-10 h-14 object-cover rounded-lg shrink-0" />
            ) : (
              <div className="w-10 h-14 bg-surface-container-high rounded-lg flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-outline/40 text-sm">menu_book</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-on-surface line-clamp-1">{p.title}</p>
              <div className="mt-1.5 space-y-1">
                <div className="flex justify-between text-[10px] text-on-surface-variant/60">
                  <span>{t('book.pagesProgress', { current: p.current_page, total: p.total_pages })}</span>
                  <span className="font-bold text-primary">{p.pct}%</span>
                </div>
                <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-secondary">
                {new Date(p.projected_finish).toLocaleDateString('default', { month: 'short', day: 'numeric' })}
              </p>
              <p className="text-[10px] text-on-surface-variant/50">{t('insights.daysLeft', { count: p.days_left })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getReadingInsights()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-8 pb-16">
        <div className="space-y-6 animate-pulse">
          <div className="h-10 bg-surface-container rounded-2xl w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-surface-container rounded-2xl" />)}
          </div>
          <div className="h-40 bg-surface-container rounded-2xl" />
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-8 pb-16 text-center py-20">
        <span className="material-symbols-outlined text-5xl text-outline/30 block mb-3">analytics</span>
        <p className="text-on-surface-variant">{t('insights.startReadingToSee')}</p>
      </main>
    )
  }

  return (
    <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-8 pb-16 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary leading-tight">{t('insights.title')}</h1>
        <p className="text-on-surface-variant mt-2 text-sm">{t('insights.subtitle')}</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label={t('insights.totalBooks')} value={fmt(data.total_books)} icon="library_books" />
        <StatCard label={t('insights.finished')} value={fmt(data.total_finished)} icon="check_circle" accent />
        <StatCard label={t('insights.pagesRead')} value={fmt(data.total_pages_read)} icon="menu_book" />
        <StatCard
          label={t('insights.avgRating')}
          value={data.avg_rating ? `${data.avg_rating}★` : '—'}
          sub={data.avg_rating ? t('insights.acrossFinishedBooks') : t('insights.rateYourBooks')}
          icon="star"
        />
      </div>

      {/* Pace */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('insights.avgPagesPerDay')}
          value={fmt(data.avg_pages_per_day)}
          sub={t('insights.last30Days')}
          icon="speed"
        />
        <StatCard
          label={t('insights.thisYear')}
          value={fmt(data.finished_this_year)}
          sub={t('insights.booksFinishedInYear', { year: new Date().getFullYear() })}
          icon="event"
        />
        <StatCard
          label={t('insights.currentlyReading')}
          value={fmt(data.total_reading)}
          sub={t('insights.booksInProgress')}
          icon="auto_stories"
        />
      </div>

      {/* Streak + yearly goal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StreakBadge current={data.current_streak} longest={data.longest_streak} />
        {data.yearly_goal ? (
          <YearlyGoalRing goal={data.yearly_goal} />
        ) : (
          <div className="bg-surface-container-low rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-center">
            <span className="material-symbols-outlined text-3xl text-outline/30">flag</span>
            <p className="text-sm font-bold text-on-surface">{t('insights.setYearlyGoalPrompt')}</p>
            <p className="text-xs text-on-surface-variant/60">{t('insights.setGoalInSettings')}</p>
          </div>
        )}
      </div>

      {/* Monthly chart */}
      <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-zen">
        <MonthlyChart data={data.monthly_pages} />
      </div>

      {/* Projected finishes */}
      {data.projected_finishes?.length > 0 && (
        <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-zen space-y-4">
          <ProjectedFinishes items={data.projected_finishes} />
        </div>
      )}

      {/* Empty encouragement */}
      {data.total_books === 0 && (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-5xl text-outline/30 block mb-3">auto_stories</span>
          <p className="font-serif text-xl text-on-surface mb-1">{t('insights.yourStoryStartsHere')}</p>
          <p className="text-sm text-on-surface-variant">{t('insights.addFirstBookPrompt')}</p>
        </div>
      )}
    </main>
  )
}
