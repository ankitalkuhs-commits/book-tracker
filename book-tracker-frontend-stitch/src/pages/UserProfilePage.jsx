import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import {
  getPublicProfile, getUserBooks, getUserActivity, getUserNotes,
  followUser, unfollowUser, getFollowing,
} from '../services/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function pct(current, total) {
  if (!total || !current) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

// ─── Reading Velocity Chart ───────────────────────────────────────────────────

function VelocityChart({ activity30, activity90 }) {
  const [range, setRange] = useState('30d')
  const data = range === '30d' ? activity30 : activity90
  const bars = data.slice(-(range === '30d' ? 30 : 90))
  const max = Math.max(...bars.map(d => d.pages_read || 0), 1)

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-serif text-lg font-bold text-on-surface">Reading Velocity</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Activity tracked over the last {range === '30d' ? '30' : '90'} days
          </p>
        </div>
        <div className="flex items-center bg-surface-container rounded-full p-0.5 text-xs font-bold">
          {['30d', '90d'].map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-full transition-all uppercase tracking-wider ${
                range === r
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant/60 hover:text-on-surface'
              }`}
            >
              {r.replace('d', 'D')}
            </button>
          ))}
        </div>
      </div>

      {bars.length === 0 || max === 1 ? (
        <div className="h-28 flex items-center justify-center text-sm text-on-surface-variant/50">
          No reading activity yet
        </div>
      ) : (
        <>
          <div className="flex items-end gap-[2px] h-28">
            {bars.map((d, i) => {
              const h = ((d.pages_read || 0) / max) * 100
              const isToday = i === bars.length - 1
              const isActive = (d.pages_read || 0) > 0
              const isHighlight = isActive && (d.pages_read || 0) >= max * 0.6
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all"
                  style={{
                    height: `${Math.max(h, isActive ? 5 : 2)}%`,
                    background: isToday && isActive
                      ? '#735c00'
                      : isHighlight
                        ? 'rgba(115,92,0,0.55)'
                        : isActive
                          ? 'rgba(0,70,74,0.30)'
                          : 'rgba(27,28,25,0.08)',
                  }}
                  title={isActive ? `${d.pages_read} pages` : ''}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">
            <span>{range === '30d' ? '30' : '90'} Days Ago</span>
            <span>Today</span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Book Cover ───────────────────────────────────────────────────────────────

function BookCover({ book }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center">
      {book?.cover_url && !broken
        ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : <span className="material-symbols-outlined text-2xl text-outline/30">menu_book</span>
      }
    </div>
  )
}

// ─── Public Note Card ─────────────────────────────────────────────────────────

function PublicNoteCard({ note }) {
  return (
    <article className="bg-surface-container-low rounded-2xl p-5 space-y-3 relative">
      {/* Share icon */}
      <button className="absolute top-4 right-4 text-on-surface-variant/30 hover:text-on-surface-variant transition-colors">
        <span className="material-symbols-outlined text-base">ios_share</span>
      </button>

      {/* Quote or text */}
      {note.quote ? (
        <p className="font-serif text-sm italic text-on-surface leading-relaxed pr-6">
          "{note.quote}"
        </p>
      ) : (
        <p className="text-sm text-on-surface leading-relaxed pr-6">{note.text}</p>
      )}
      {note.quote && note.text && (
        <p className="text-xs text-on-surface-variant leading-relaxed">{note.text}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50">
          {formatDate(note.created_at)}
        </span>
        {note.book && (
          <span className="text-[10px] font-bold text-secondary/80 bg-secondary/10 px-2.5 py-1 rounded-full">
            Re: {note.book.title}
          </span>
        )}
      </div>

      {note.likes_count > 0 || note.comments_count > 0 ? (
        <div className="flex items-center gap-4 pt-0.5 border-t border-outline-variant/10 text-xs font-bold text-on-surface-variant/50">
          {note.likes_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-error/50" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
              {note.likes_count}
            </span>
          )}
          {note.comments_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">chat_bubble</span>
              {note.comments_count}
            </span>
          )}
        </div>
      ) : null}
    </article>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function UserProfilePage() {
  const { userId } = useParams()
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [profile, setProfile] = useState(null)
  const [books, setBooks] = useState([])
  const [notes, setNotes] = useState([])
  const [activity30, setActivity30] = useState([])
  const [activity90, setActivity90] = useState([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)
  const [showAllBooks, setShowAllBooks] = useState(false)

  const isOwnProfile = me?.id?.toString() === userId?.toString()

  useEffect(() => {
    if (isOwnProfile) { navigate('/profile', { replace: true }); return }

    const safe = (p) => p.catch(() => null)

    Promise.all([
      getPublicProfile(userId),
      safe(getUserBooks(userId)),
      safe(getUserNotes(userId)),
      safe(getUserActivity(userId, 30)),
      safe(getUserActivity(userId, 90)),
      safe(getFollowing()),
    ]).then(([p, b, n, a30, a90, following]) => {
      setProfile(p)
      setBooks(b || [])
      setNotes(n || [])
      setActivity30(a30 || [])
      setActivity90(a90 || [])
      const followingIds = (following || []).map(u => u.id?.toString())
      setIsFollowing(followingIds.includes(userId?.toString()))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [userId, isOwnProfile])

  const toggleFollow = async () => {
    setFollowLoading(true)
    try {
      if (isFollowing) {
        await unfollowUser(userId)
        setIsFollowing(false)
        setProfile(p => ({ ...p, followers_count: Math.max(0, (p?.followers_count || 1) - 1) }))
        toast('Unfollowed', 'info')
      } else {
        await followUser(userId)
        setIsFollowing(true)
        setProfile(p => ({ ...p, followers_count: (p?.followers_count || 0) + 1 }))
        toast(`Following ${profile?.name || 'user'}`, 'success')
      }
    } catch (e) {
      toast(e.message || 'Failed', 'error')
    }
    setFollowLoading(false)
  }

  if (loading) {
    return (
      <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-8 pb-16 space-y-6">
        <div className="h-56 bg-surface-container-lowest rounded-3xl animate-pulse" />
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 h-40 bg-surface-container-lowest rounded-3xl animate-pulse" />
          <div className="col-span-8 h-40 bg-surface-container-lowest rounded-3xl animate-pulse" />
        </div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-20 pb-16 text-center">
        <span className="material-symbols-outlined text-6xl text-outline/30 block mb-4">person_off</span>
        <p className="font-serif text-2xl text-on-surface">User not found</p>
      </main>
    )
  }

  const initials = profile.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const stats = profile.stats
  const totalPages = activity90.reduce((s, d) => s + (d.pages_read || 0), 0)
  const displayBooks = showAllBooks ? books : books.slice(0, 6)

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-8 pb-16 space-y-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <section className="bg-surface-container-lowest rounded-3xl p-8">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-28 h-28 rounded-2xl overflow-hidden bg-primary border-4 border-primary-fixed-dim flex items-center justify-center">
              {profile.profile_picture ? (
                <img src={profile.profile_picture} alt={profile.name}
                  className="w-full h-full object-cover"
                  onError={e => { e.target.style.display = 'none' }} />
              ) : (
                <span className="text-on-primary text-3xl font-bold font-sans">{initials}</span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-on-surface">{profile.name}</h1>
            {profile.username && (
              <p className="text-sm font-medium text-on-surface-variant">@{profile.username}</p>
            )}
            {profile.bio && (
              <p className="text-sm italic text-primary/80 leading-relaxed max-w-2xl font-serif">
                "{profile.bio}"
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-8 pt-2">
              {[
                { value: profile.followers_count || 0, label: 'Followers' },
                { value: profile.following_count || 0, label: 'Following' },
                { value: stats?.total_books || books.length, label: 'Collections' },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p className="font-serif text-2xl font-bold text-on-surface leading-none">{value?.toLocaleString()}</p>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Follow button */}
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`shrink-0 flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all ${
              isFollowing
                ? 'bg-surface-container border border-outline-variant text-on-surface hover:bg-error-container/20 hover:text-error hover:border-error/30'
                : 'btn-primary'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {isFollowing ? 'person_check' : 'person_add'}
            </span>
            {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>
      </section>

      {/* ── Progress + Velocity ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">

        {/* Progress card */}
        <div className="md:col-span-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4 h-full">
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
              {new Date().getFullYear()} Progress
            </p>

            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-5xl font-bold text-on-surface">{stats?.finished || 0}</span>
                <span className="text-sm text-on-surface-variant">/ {stats?.total_books || 0} books</span>
              </div>
              {stats?.total_books > 0 && (
                <div className="h-2 bg-surface-container-high rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full bg-secondary rounded-full transition-all"
                    style={{ width: `${pct(stats.finished, stats.total_books)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-on-surface-variant pt-1">
              <span className="material-symbols-outlined text-base text-on-surface-variant/40">description</span>
              {totalPages.toLocaleString()} pages read
            </div>
          </div>
        </div>

        {/* Velocity chart */}
        <div className="md:col-span-8">
          <VelocityChart activity30={activity30} activity90={activity90} />
        </div>
      </div>

      {/* ── Library + Notes ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Curated Library */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl font-bold text-on-surface">Curated Library</h2>
            {books.length > 6 && (
              <button
                onClick={() => setShowAllBooks(v => !v)}
                className="text-sm font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                {showAllBooks ? 'Show Less' : `View All ${books.length} Books`}
                <span className="material-symbols-outlined text-base">
                  {showAllBooks ? 'expand_less' : 'arrow_forward'}
                </span>
              </button>
            )}
          </div>

          {books.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-12 text-center border border-outline-variant/10">
              <span className="material-symbols-outlined text-5xl text-outline/30 block mb-3">menu_book</span>
              <p className="text-on-surface-variant">No books in library yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              {displayBooks.map(ub => (
                <div key={ub.id} className="space-y-2">
                  <BookCover book={ub.book} />
                  <p className="text-xs font-bold text-on-surface line-clamp-2 leading-snug">{ub.book?.title}</p>
                  <p className="text-[10px] text-on-surface-variant/60 truncate">{ub.book?.author}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Public Notes */}
        <div className="lg:col-span-5 space-y-4">
          <h2 className="font-serif text-2xl font-bold text-on-surface">Public Notes</h2>

          {notes.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-10 text-center border border-outline-variant/10">
              <span className="material-symbols-outlined text-5xl text-outline/30 block mb-3">edit_note</span>
              <p className="text-on-surface-variant text-sm">No public notes yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map(note => (
                <PublicNoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
