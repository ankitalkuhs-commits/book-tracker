import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import {
  getMyProfile, getMyNotes, getMyActivity, getUserBooks,
  createNote, deleteNote, updateMyProfile, getMyBooks,
} from '../services/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function calcStreak(activity) {
  let streak = 0
  for (let i = activity.length - 1; i >= 0; i--) {
    if ((activity[i].pages_read || 0) > 0) streak++
    else break
  }
  return streak
}

function pct(current, total) {
  if (!total || !current) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

// ─── Activity Chart ───────────────────────────────────────────────────────────

function ActivityChart({ data }) {
  if (!data || data.length === 0) return (
    <div className="h-32 flex items-center justify-center text-sm text-on-surface-variant/50">
      No reading activity yet
    </div>
  )
  const bars = data.slice(-30)
  const max = Math.max(...bars.map(d => d.pages_read || 0), 1)
  const streak = calcStreak(bars)

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-serif text-lg font-bold text-on-surface">30-Day Activity</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">Consistent daily habits tracked in pages</p>
        </div>
        {streak > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full" style={{ background: 'rgba(115,92,0,0.12)', color: '#735c00' }}>
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
            Active Streak: {streak} {streak === 1 ? 'Day' : 'Days'}
          </span>
        )}
      </div>

      {/* Bars */}
      <div className="flex items-end gap-[3px] h-28">
        {bars.map((d, i) => {
          const h = ((d.pages_read || 0) / max) * 100
          const isToday = i === bars.length - 1
          const isActive = (d.pages_read || 0) > 0
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all"
              style={{
                height: `${Math.max(h, isActive ? 6 : 3)}%`,
                background: isToday && isActive
                  ? '#735c00'
                  : isActive
                    ? 'rgba(0,70,74,0.35)'
                    : 'rgba(0,70,74,0.10)',
              }}
              title={isActive ? `${d.pages_read} pages` : 'No activity'}
            />
          )
        })}
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50">
        <span>30 Days Ago</span>
        <span>Today</span>
      </div>
    </div>
  )
}

// ─── Book Cover ───────────────────────────────────────────────────────────────

function BookThumb({ book }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="w-14 shrink-0 aspect-[2/3] rounded-md overflow-hidden bg-surface-container-high flex items-center justify-center">
      {book?.cover_url && !broken
        ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : <span className="material-symbols-outlined text-xl text-outline/40">menu_book</span>
      }
    </div>
  )
}

// ─── New Note Modal ───────────────────────────────────────────────────────────

function NewNoteModal({ onClose, onPosted }) {
  const toast = useToast()
  const [books, setBooks] = useState([])
  const [text, setText] = useState('')
  const [quote, setQuote] = useState('')
  const [userbookId, setUserbookId] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    getMyBooks('reading').then(b => setBooks(b || [])).catch(() => {})
  }, [])

  const handlePost = async () => {
    if (!text.trim()) return
    setPosting(true)
    try {
      await createNote({ text: text.trim(), quote: quote.trim() || null, userbook_id: userbookId || null })
      toast('Note posted!', 'success')
      onPosted()
      onClose()
    } catch (e) {
      toast(e.message || 'Failed to post', 'error')
    }
    setPosting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/20 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-3xl shadow-float w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/15">
          <h2 className="font-serif text-xl font-bold text-primary">New Note</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {books.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Book (optional)</label>
              <select
                value={userbookId}
                onChange={e => setUserbookId(e.target.value)}
                className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— No book —</option>
                {books.map(ub => (
                  <option key={ub.id} value={ub.id}>{ub.book?.title}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Reflection</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Share a reading reflection..."
              rows={4}
              autoFocus
              className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Quote (optional)</label>
            <input
              value={quote}
              onChange={e => setQuote(e.target.value)}
              placeholder="A memorable line from the book..."
              className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-5 py-2.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
              Cancel
            </button>
            <button
              onClick={handlePost}
              disabled={posting || !text.trim()}
              className="btn-primary px-6 py-2.5 text-sm rounded-xl disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Post Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Bio Modal ───────────────────────────────────────────────────────────

function EditBioModal({ profile, onClose, onSaved }) {
  const { user, login } = useAuth()
  const toast = useToast()
  const [bio, setBio] = useState(profile?.bio || '')
  const [name, setName] = useState(profile?.name || user?.name || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const updated = await updateMyProfile({ name: name.trim(), bio: bio.trim() || null })
      login({ ...user, name: updated.name, bio: updated.bio })
      toast('Profile updated!', 'success')
      onSaved(updated)
      onClose()
    } catch (e) {
      toast(e.message || 'Failed to save', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/20 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-3xl shadow-float w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/15">
          <h2 className="font-serif text-xl font-bold text-primary">Edit Profile</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Display Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell your reading story..."
              rows={3}
              className="w-full bg-surface-container-low rounded-xl px-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-5 py-2.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="btn-primary px-6 py-2.5 text-sm rounded-xl disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCoverThumb({ book }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="w-10 shrink-0 aspect-[2/3] rounded-md overflow-hidden bg-surface-container-high flex items-center justify-center">
      {book?.cover_url && !broken
        ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : <span className="material-symbols-outlined text-base text-outline/30">menu_book</span>
      }
    </div>
  )
}

function NoteCard({ note, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <article className="bg-surface-container-lowest rounded-2xl p-5 space-y-3 border border-outline-variant/10">
      {/* Top row: cover + title/date + menu */}
      <div className="flex items-start gap-3">
        {note.book && <NoteCoverThumb book={note.book} />}
        <div className="flex-1 min-w-0">
          {note.book && (
            <p className="font-bold text-sm text-on-surface leading-snug line-clamp-1">{note.book.title}</p>
          )}
          <p className="text-xs text-on-surface-variant mt-0.5">{formatDate(note.created_at)}</p>
        </div>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="text-on-surface-variant/40 hover:text-on-surface transition-colors p-1 -m-1"
          >
            <span className="material-symbols-outlined text-lg">more_vert</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 bg-surface-container-lowest rounded-xl shadow-float py-1 w-36 z-10 border border-outline-variant/15">
              <button
                onClick={() => { setMenuOpen(false); onDelete(note.id) }}
                className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error-container/20 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quote — italic, serif, primary-tinted */}
      {note.quote && (
        <p className="font-serif italic text-sm text-primary/80 leading-relaxed">
          "{note.quote}"
        </p>
      )}

      {/* Body text */}
      {note.text && (
        <p className="text-sm text-on-surface leading-relaxed">{note.text}</p>
      )}

      {/* Footer: hearts + comments */}
      <div className="flex items-center gap-5 pt-1 border-t border-outline-variant/10">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/50">
          <span className="material-symbols-outlined text-sm text-error/50">favorite</span>
          {note.likes_count || 0} Hearts
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/50">
          <span className="material-symbols-outlined text-sm">chat_bubble</span>
          {note.comments_count || 0} Comments
        </span>
        <span className="ml-auto text-xs text-on-surface-variant/40">{timeAgo(note.created_at)}</span>
      </div>
    </article>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [notes, setNotes] = useState([])
  const [books, setBooks] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewNote, setShowNewNote] = useState(false)
  const [showEditBio, setShowEditBio] = useState(false)

  const load = () => Promise.all([
    getMyProfile(),
    getMyNotes(),
    getUserBooks(user?.id),
    getMyActivity(30),
  ]).then(([p, n, b, a]) => {
    setProfile(p)
    setNotes(n || [])
    setBooks(b || [])
    setActivity(a || [])
  }).catch(() => {}).finally(() => setLoading(false))

  useEffect(() => { load() }, [user?.id])

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return
    try {
      await deleteNote(noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
      toast('Note deleted', 'info')
    } catch (e) {
      toast(e.message || 'Failed to delete', 'error')
    }
  }

  const handleSignOut = () => { logout(); navigate('/') }

  const currentlyReading = books.filter(b => b.status === 'reading').slice(0, 3)
  const stats = profile?.stats
  const initials = (profile?.name || user?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  if (loading) {
    return (
      <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-8 pb-16 space-y-6">
        <div className="h-44 bg-surface-container-lowest rounded-3xl animate-pulse" />
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 h-80 bg-surface-container-lowest rounded-3xl animate-pulse" />
          <div className="col-span-8 h-80 bg-surface-container-lowest rounded-3xl animate-pulse" />
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-8 pb-16 space-y-6">

      {/* ── Profile Header ─────────────────────────────────────── */}
      <section className="bg-surface-container-lowest rounded-3xl p-8">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-2xl overflow-hidden bg-primary border-4 border-primary-fixed-dim flex items-center justify-center">
              {user?.profile_picture ? (
                <img src={user.profile_picture} alt={user.name} className="w-full h-full object-cover"
                  onError={e => { e.target.style.display = 'none' }} />
              ) : (
                <span className="text-on-primary text-3xl font-bold font-sans">{initials}</span>
              )}
            </div>
            <button
              onClick={() => setShowEditBio(true)}
              className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
              title="Edit profile"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
            </button>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-serif text-3xl font-bold text-on-surface">{profile?.name || user?.name}</h1>
              <button
                onClick={() => setShowEditBio(true)}
                className="flex items-center gap-1 text-xs font-bold text-secondary hover:text-secondary/80 transition-colors uppercase tracking-wider"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                Edit Bio
              </button>
            </div>
            {user?.username && (
              <p className="text-sm text-on-surface-variant">@{user.username}</p>
            )}
            {(profile?.bio || user?.bio) && (
              <p className="text-sm text-on-surface leading-relaxed max-w-2xl">
                {profile?.bio || user?.bio}
              </p>
            )}
            {!profile?.bio && !user?.bio && (
              <button
                onClick={() => setShowEditBio(true)}
                className="text-sm text-on-surface-variant/50 italic hover:text-on-surface-variant transition-colors"
              >
                Add a bio...
              </button>
            )}

            {/* Stats pills */}
            <div className="flex items-center gap-6 pt-2">
              {[
                { value: profile?.followers_count ?? 0, label: 'Followers' },
                { value: profile?.following_count ?? 0, label: 'Following' },
                { value: stats?.total_books ?? books.length, label: 'Books' },
              ].map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="font-serif text-2xl font-bold text-on-surface leading-none">{value?.toLocaleString()}</p>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2-column layout ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left sidebar */}
        <div className="lg:col-span-4 space-y-5">

          {/* Reading Analytics */}
          <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
            <h2 className="font-serif text-base font-bold text-primary">Reading Analytics</h2>

            <div className="space-y-3">
              <div className="bg-surface-container-low rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Total Books</p>
                  <p className="font-serif text-3xl font-bold text-on-surface mt-0.5">{stats?.total_books ?? books.length}</p>
                </div>
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/20">auto_stories</span>
              </div>

              <div className="bg-surface-container-low rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Pages Read</p>
                  <p className="font-serif text-3xl font-bold text-on-surface mt-0.5">
                    {(stats?.total_pages_read || 0).toLocaleString()}
                  </p>
                </div>
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/20">description</span>
              </div>
            </div>

            {/* Account links */}
            <div className="border-t border-outline-variant/15 pt-3 space-y-1">
              <button
                onClick={() => navigate('/settings')}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-surface-container transition-colors text-sm text-on-surface"
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base text-on-surface-variant">settings</span>
                  Account Settings
                </span>
                <span className="material-symbols-outlined text-base text-on-surface-variant/40">chevron_right</span>
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-error-container/20 transition-colors text-sm text-error"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                Sign Out
              </button>
            </div>
          </section>

          {/* Currently Reading */}
          {currentlyReading.length > 0 && (
            <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
              <h2 className="font-serif text-base font-bold text-primary">Currently Reading</h2>
              <div className="space-y-4">
                {currentlyReading.map(ub => {
                  const progress = pct(ub.current_page, ub.book?.total_pages)
                  return (
                    <div key={ub.id} className="flex gap-3 items-start">
                      <BookThumb book={ub.book} />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="font-bold text-sm text-on-surface leading-snug line-clamp-2">{ub.book?.title}</p>
                        <p className="text-xs text-on-surface-variant truncate">{ub.book?.author}</p>
                        {ub.book?.total_pages && (
                          <div className="space-y-1">
                            <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                              <div
                                className="h-full bg-secondary rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">{progress}% Completed</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right main */}
        <div className="lg:col-span-8 space-y-6">

          {/* 30-Day Activity */}
          <section className="bg-surface-container-lowest rounded-3xl p-6">
            <ActivityChart data={activity} />
          </section>

          {/* My Notes */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-on-surface">My Notes</h2>
              <button
                onClick={() => setShowNewNote(true)}
                className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold"
              >
                <span className="material-symbols-outlined text-base">add</span>
                New Entry
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-2xl p-12 text-center border border-outline-variant/10">
                <span className="material-symbols-outlined text-5xl text-outline/30 block mb-3">edit_note</span>
                <p className="font-serif text-lg text-on-surface">No notes yet</p>
                <p className="text-sm text-on-surface-variant mt-1">Share your reading reflections with the world.</p>
                <button
                  onClick={() => setShowNewNote(true)}
                  className="btn-primary mt-5 px-6 py-2.5 text-sm rounded-xl"
                >
                  Write your first note
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {notes.map(note => (
                  <NoteCard key={note.id} note={note} onDelete={handleDeleteNote} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modals */}
      {showNewNote && (
        <NewNoteModal
          onClose={() => setShowNewNote(false)}
          onPosted={() => { load() }}
        />
      )}
      {showEditBio && (
        <EditBioModal
          profile={profile}
          onClose={() => setShowEditBio(false)}
          onSaved={(updated) => setProfile(p => ({ ...p, ...updated }))}
        />
      )}
    </main>
  )
}
