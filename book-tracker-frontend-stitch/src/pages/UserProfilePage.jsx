import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import BookPreviewModal from '../components/BookPreviewModal'
import {
  getPublicProfile, getUserBooks, getUserActivity, getUserNotes, getUserStats,
  followUser, unfollowUser, adminDeleteNote, likeNote, unlikeNote,
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

function PublicNoteCard({ note, profileUrl, isAdmin, onDelete, onLike }) {
  const toast = useToast()

  const handleShare = async () => {
    const text = note.quote ? `"${note.quote}"` : note.text || ''
    const bookLabel = note.book ? ` — ${note.book.title}` : ''
    const shareData = {
      title: `Note on TrackMyRead${bookLabel}`,
      text: text,
      url: profileUrl || window.location.href,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(`${text}\n${shareData.url}`)
        toast('Copied to clipboard', 'success')
      }
    } catch { /* user cancelled share */ }
  }

  return (
    <article className="bg-surface-container-low rounded-2xl p-5 space-y-3 relative">
      {/* Top-right actions */}
      <div className="absolute top-4 right-4 flex items-center gap-1">
        {isAdmin && (
          <button
            onClick={() => onDelete(note.id)}
            className="text-on-surface-variant/30 hover:text-error transition-colors"
            title="Delete note (admin)"
          >
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        )}
        <button
          onClick={handleShare}
          className="text-on-surface-variant/30 hover:text-on-surface-variant transition-colors"
          title="Share this note"
        >
          <span className="material-symbols-outlined text-base">ios_share</span>
        </button>
      </div>

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

      <div className="flex items-center gap-4 pt-0.5 border-t border-outline-variant/10 text-xs font-bold text-on-surface-variant/50">
        <button
          onClick={() => onLike(note.id, note.liked_by_me)}
          className="flex items-center gap-1 hover:text-error/80 transition-colors"
        >
          <span
            className="material-symbols-outlined text-sm"
            style={{
              color: note.liked_by_me ? '#e53935' : undefined,
              fontVariationSettings: note.liked_by_me ? "'FILL' 1" : "'FILL' 0",
            }}
          >favorite</span>
          {note.likes_count || 0}
        </button>
        {note.comments_count > 0 && (
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">chat_bubble</span>
            {note.comments_count}
          </span>
        )}
      </div>
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
  const [stats, setStats] = useState(null)
  const [books, setBooks] = useState([])
  const [notes, setNotes] = useState([])
  const [activity30, setActivity30] = useState([])
  const [activity90, setActivity90] = useState([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)
  const [showAllBooks, setShowAllBooks] = useState(false)
  const [previewBook, setPreviewBook] = useState(null)
  const likingInFlight = useRef(new Set())

  const isOwnProfile = me?.id?.toString() === userId?.toString()

  useEffect(() => {
    if (isOwnProfile) { navigate('/profile', { replace: true }); return }

    const safe = (p) => p.catch(() => null)

    getPublicProfile(userId).then(p => {
      setProfile(p)
      setIsFollowing(p.is_following || false)
      // If profile is locked, don't bother fetching books/notes/activity
      if (p.locked) { setLoading(false); return }
      return Promise.all([
        safe(getUserBooks(userId)),
        safe(getUserNotes(userId)),
        safe(getUserActivity(userId, 30)),
        safe(getUserActivity(userId, 90)),
        safe(getUserStats(userId)),
      ]).then(([b, n, a30, a90, s]) => {
        setBooks(b || [])
        setNotes(n || [])
        setActivity30(a30 || [])
        setActivity90(a90 || [])
        setStats(s || null)
      })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [userId, isOwnProfile])

  const handleAdminDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return
    try {
      await adminDeleteNote(noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
      toast('Note deleted', 'info')
    } catch (e) {
      toast(e.message || 'Failed to delete', 'error')
    }
  }

  const handleLike = async (noteId, isLiked) => {
    if (likingInFlight.current.has(noteId)) return
    likingInFlight.current.add(noteId)
    setNotes(prev => prev.map(n => n.id === noteId
      ? { ...n, liked_by_me: !isLiked, likes_count: isLiked ? Math.max(0, (n.likes_count || 1) - 1) : (n.likes_count || 0) + 1 }
      : n
    ))
    try {
      if (isLiked) await unlikeNote(noteId)
      else await likeNote(noteId)
    } catch {
      setNotes(prev => prev.map(n => n.id === noteId
        ? { ...n, liked_by_me: isLiked, likes_count: isLiked ? (n.likes_count || 0) + 1 : Math.max(0, (n.likes_count || 1) - 1) }
        : n
      ))
    } finally { likingInFlight.current.delete(noteId) }
  }

  const toggleFollow = async () => {
    setFollowLoading(true)
    try {
      if (isFollowing) {
        await unfollowUser(userId)
        setIsFollowing(false)
        setProfile(p => ({ ...p, followers_count: Math.max(0, (p?.followers_count || 1) - 1), is_following: false }))
        toast('Unfollowed', 'info')
      } else {
        await followUser(userId)
        setIsFollowing(true)
        setProfile(p => ({ ...p, followers_count: (p?.followers_count || 0) + 1, is_following: true, locked: false }))
        toast(`Following ${profile?.name || 'user'}`, 'success')
        // Load content now that we have access
        const safe = (p) => p.catch(() => null)
        const [b, n, a30, a90, s] = await Promise.all([
          safe(getUserBooks(userId)),
          safe(getUserNotes(userId)),
          safe(getUserActivity(userId, 30)),
          safe(getUserActivity(userId, 90)),
          safe(getUserStats(userId)),
        ])
        setBooks(b || [])
        setNotes(n || [])
        setActivity30(a30 || [])
        setActivity90(a90 || [])
        setStats(s || null)
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

  const initials     = profile.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const totalPages   = activity90.reduce((s, d) => s + (d.pages_read || 0), 0)
  const displayBooks = showAllBooks ? books : books.slice(0, 6)
  const finishedCount = stats?.finished ?? books.filter(b => b.status === 'finished').length
  const readingCount  = stats?.reading  ?? books.filter(b => b.status === 'reading').length
  const thisYear      = stats?.this_year ?? 0
  const avgPpd        = activity30.length > 0
    ? Math.round(activity30.reduce((s, d) => s + (d.pages_read || 0), 0) / activity30.length)
    : null
  const joinedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null
  const currentYear = new Date().getFullYear()

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
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-primary">{profile.name}</h1>
            {profile.username && (
              <p className="text-sm font-medium text-on-surface-variant">@{profile.username}</p>
            )}
            {profile.bio && (
              <p className="text-sm italic text-primary/80 leading-relaxed max-w-2xl font-serif">
                "{profile.bio}"
              </p>
            )}
            {joinedDate && (
              <p className="text-xs text-on-surface-variant/60 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">calendar_month</span>
                Member since {joinedDate}
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
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            {profile.follows_you && !isFollowing && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50">Follows you</span>
            )}
            <button
              onClick={toggleFollow}
              disabled={followLoading}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all ${
                isFollowing
                  ? 'bg-surface-container border border-outline-variant text-on-surface hover:bg-error-container/20 hover:text-error hover:border-error/30'
                  : 'btn-primary'
              }`}
            >
              <span className="material-symbols-outlined text-base">
                {isFollowing ? 'person_check' : 'person_add'}
              </span>
              {followLoading ? '...' : isFollowing ? 'Following' : profile.follows_you ? 'Follow Back' : 'Follow'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Locked profile state ────────────────────────────────── */}
      {profile.locked && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center bg-surface-container-lowest rounded-3xl">
          <span className="material-symbols-outlined text-5xl text-outline/40" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
          <p className="font-serif text-xl font-bold text-on-surface">This profile is private</p>
          <p className="text-sm text-on-surface-variant max-w-xs">
            Follow {profile.name?.split(' ')[0] || 'this user'} to see their library and reading notes.
          </p>
        </div>
      )}

      {/* ── Progress + Velocity ─────────────────────────────────── */}
      {!profile.locked && <><div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">

        {/* Stats card */}
        <div className="md:col-span-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-5 h-full">
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">{currentYear}</p>

            {/* Book counts */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { value: finishedCount, label: 'Finished' },
                { value: readingCount,  label: 'Reading' },
                { value: thisYear,      label: 'This Year' },
              ].map(({ value, label }) => (
                <div key={label} className="bg-surface-container rounded-2xl py-3 px-1">
                  <p className="font-serif text-2xl font-bold text-on-surface leading-none">{value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Yearly goal progress */}
            {profile.yearly_goal > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant/60 font-medium">{currentYear} Goal</span>
                  <span className="font-bold text-secondary">{finishedCount} / {profile.yearly_goal} books</span>
                </div>
                <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className="h-full bg-secondary rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.round((finishedCount / profile.yearly_goal) * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Pages */}
            {totalPages > 0 && (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-base text-on-surface-variant/40">description</span>
                {totalPages.toLocaleString()} pages read (90d)
              </div>
            )}

            {/* Speed */}
            {avgPpd != null && avgPpd > 0 && (
              <div className="flex items-center gap-2 bg-primary/8 rounded-2xl px-4 py-3">
                <span className="material-symbols-outlined text-base text-primary">speed</span>
                <div>
                  <span className="font-serif text-lg font-bold text-primary">{avgPpd}</span>
                  <span className="text-xs text-primary/70 ml-1">avg pages/day</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Velocity chart */}
        <div className="md:col-span-8">
          <VelocityChart activity30={activity30} activity90={activity90} />
        </div>
      </div>

      {/* ── Currently Reading ───────────────────────────────────── */}
      {books.filter(b => b.status === 'reading').length > 0 && (
        <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
          <h2 className="font-serif text-xl font-bold text-on-surface">Currently Reading</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.filter(b => b.status === 'reading').slice(0, 3).map(ub => {
              const total = ub.book?.total_pages || 0
              const progress = total > 0 ? Math.min(100, Math.round(((ub.current_page || 0) / total) * 100)) : 0
              return (
                <button key={ub.id} className="flex items-center gap-3 text-left group" onClick={() => ub.book && setPreviewBook(ub.book)}>
                  <div className="w-12 h-[72px] rounded-lg overflow-hidden bg-surface-container-high shrink-0 flex items-center justify-center">
                    {ub.book?.cover_url
                      ? <img src={ub.book.cover_url} alt={ub.book.title} className="w-full h-full object-cover" />
                      : <span className="material-symbols-outlined text-lg text-outline/30">menu_book</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">{ub.book?.title}</p>
                    <p className="text-xs text-on-surface-variant/60 truncate">{ub.book?.author}</p>
                    {total > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-primary">{progress}%</span>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                <button key={ub.id} className="space-y-2 text-left group" onClick={() => ub.book && setPreviewBook(ub.book)}>
                  <div className="group-hover:opacity-90 transition-opacity">
                    <BookCover book={ub.book} />
                  </div>
                  <p className="text-xs font-bold text-on-surface line-clamp-2 leading-snug">{ub.book?.title}</p>
                  <p className="text-[10px] text-on-surface-variant/60 truncate">{ub.book?.author}</p>
                </button>
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
                <PublicNoteCard key={note.id} note={note} profileUrl={`${window.location.origin}/profile/${userId}`} isAdmin={me?.is_admin} onDelete={handleAdminDeleteNote} onLike={handleLike} />
              ))}
            </div>
          )}
        </div>
      </div></>}
      {previewBook && <BookPreviewModal book={previewBook} onClose={() => setPreviewBook(null)} />}
    </main>
  )
}
