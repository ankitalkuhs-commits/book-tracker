import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { getMyProfile, getMyNotes, getMyActivity, getUserBooks, deleteNote } from '../services/api'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function ActivityChart({ data }) {
  if (!data || data.length === 0) return null
  const bars = data.slice(-30)
  const max = Math.max(...bars.map(d => d.pages_read || 0), 1)
  const barW = 100 / bars.length
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-20">
      {bars.map((d, i) => {
        const h = ((d.pages_read || 0) / max) * 36
        return (
          <rect key={i} x={i * barW + 0.3} y={40 - h} width={barW - 0.6} height={h} rx="1"
            className="fill-primary/30 hover:fill-primary/70 transition-colors" />
        )
      })}
    </svg>
  )
}

function BookCover({ book }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="aspect-[2/3] rounded-lg overflow-hidden bg-surface-container-high flex items-center justify-center">
      {book?.cover_url && !broken
        ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : <span className="material-symbols-outlined text-2xl text-outline/40">menu_book</span>
      }
    </div>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [notes, setNotes] = useState([])
  const [books, setBooks] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('notes')

  useEffect(() => {
    Promise.all([
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
  }, [user?.id])

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return
    try {
      await deleteNote(noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch (e) {
      toast(e.message || 'Failed to delete note', 'error')
    }
  }

  const stats = profile?.stats
  const reading = books.filter(b => b.status === 'reading').slice(0, 6)

  if (loading) {
    return (
      <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-8 pb-12 space-y-6">
        <div className="h-40 bg-surface-container-lowest rounded-3xl animate-pulse" />
        <div className="h-60 bg-surface-container-lowest rounded-3xl animate-pulse" />
      </main>
    )
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-8 pb-12 space-y-8">
      {/* Profile header */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 flex flex-col md:flex-row gap-6 items-start">
        {/* Avatar */}
        <div className="w-20 h-20 shrink-0 rounded-full overflow-hidden border-4 border-primary-fixed-dim bg-primary flex items-center justify-center">
          {user?.profile_picture ? (
            <img src={user.profile_picture} alt={user.name} className="w-full h-full object-cover"
              onError={e => { e.target.style.display = 'none' }} />
          ) : (
            <span className="text-on-primary text-2xl font-bold font-sans">{initials}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          <h1 className="font-serif text-2xl font-bold text-primary">{user?.name}</h1>
          {user?.username && <p className="text-sm text-on-surface-variant">@{user.username}</p>}
          {profile?.bio && <p className="text-sm text-on-surface leading-relaxed max-w-lg">{profile.bio}</p>}
          <div className="flex items-center gap-6 pt-1 text-sm text-on-surface-variant">
            <span><strong className="text-on-surface">{profile?.followers_count || 0}</strong> followers</span>
            <span><strong className="text-on-surface">{profile?.following_count || 0}</strong> following</span>
          </div>
        </div>

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            {[
              { label: 'Total', value: stats.total_books },
              { label: 'Reading', value: stats.reading },
              { label: 'Finished', value: stats.finished },
              { label: 'Pages', value: stats.total_pages_read?.toLocaleString() || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-container-low rounded-2xl p-3 text-center">
                <p className="text-xl font-bold font-serif text-primary">{value}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 30-day activity */}
      {activity.length > 0 && (
        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-3">
          <div className="flex justify-between items-baseline">
            <h2 className="font-serif text-lg font-bold text-primary">30-Day Reading Pulse</h2>
            <span className="text-xs text-on-surface-variant">
              {activity.reduce((s, d) => s + (d.pages_read || 0), 0)} pages
            </span>
          </div>
          <ActivityChart data={activity} />
          <p className="text-xs text-on-surface-variant/60 text-center">Pages read per day</p>
        </section>
      )}

      {/* Currently reading */}
      {reading.length > 0 && (
        <section className="bg-surface-container-lowest rounded-3xl p-6 space-y-4">
          <h2 className="font-serif text-lg font-bold text-primary">Currently Reading</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {reading.map(ub => (
              <div key={ub.id} className="space-y-2">
                <BookCover book={ub.book} />
                <p className="text-xs font-bold text-on-surface truncate">{ub.book?.title}</p>
                {ub.book?.total_pages && ub.current_page && (
                  <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, Math.round((ub.current_page / ub.book.total_pages) * 100))}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabs: Notes / All Books */}
      <div className="border-b border-outline-variant/15 flex gap-1">
        {[
          { id: 'notes', label: `Notes (${notes.length})` },
          { id: 'books', label: `Books (${books.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 px-4 text-sm font-sans transition-colors ${
              activeTab === tab.id
                ? 'text-primary font-bold border-b-2 border-primary'
                : 'text-on-surface-variant/60 font-medium hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          {notes.length === 0 && (
            <div className="text-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl text-outline/40 block mb-2">edit_note</span>
              <p className="font-serif">No notes yet. Start sharing your reading reflections!</p>
            </div>
          )}
          {notes.map(note => (
            <article key={note.id} className="bg-surface-container-lowest rounded-2xl p-5 space-y-3">
              {note.book && (
                <p className="text-xs font-bold text-secondary uppercase tracking-widest">{note.book.title}</p>
              )}
              <p className="text-on-surface leading-relaxed">{note.text}</p>
              {note.quote && (
                <div className="bg-surface-container-low p-4 rounded-xl border-l-4 border-secondary/40 italic text-on-surface-variant font-serif text-sm">
                  "{note.quote}"
                </div>
              )}
              <div className="flex justify-between items-center text-xs text-on-surface-variant/60">
                <span>{timeAgo(note.created_at)}</span>
                <button onClick={() => handleDeleteNote(note.id)} className="text-error/60 hover:text-error transition-colors">
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* All books */}
      {activeTab === 'books' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {books.length === 0 && (
            <p className="col-span-full text-center text-on-surface-variant py-12">No books in library yet.</p>
          )}
          {books.map(ub => (
            <div key={ub.id} className="space-y-2">
              <BookCover book={ub.book} />
              <p className="text-xs font-bold text-on-surface truncate">{ub.book?.title}</p>
              <p className="text-[10px] text-on-surface-variant/60">{ub.book?.author}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
