import { useState, useEffect, useRef } from 'react'
import { useToast } from '../components/Toast'
import {
  getMyBooks, updateProgress, updateUserBook, markFinished, removeFromLibrary,
  getNotesForBook, createNote, deleteNote,
  searchGoogleBooks, addToLibrary, getMyActivity,
} from '../services/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { id: 'all',      label: 'All',             status: null },
  { id: 'reading',  label: 'Reading',         status: 'reading' },
  { id: 'to-read',  label: 'Want to Read',    status: 'to-read' },
  { id: 'finished', label: 'Finished',        status: 'finished' },
]

const STATUS_BADGE = {
  'reading':  { label: 'Reading',        cls: 'bg-primary/10 text-primary' },
  'to-read':  { label: 'Want to Read',   cls: 'bg-tertiary/10 text-tertiary' },
  'finished': { label: 'Finished',       cls: 'bg-secondary/10 text-secondary' },
}

function pct(current, total) {
  if (!total || !current) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Book Cover ───────────────────────────────────────────────────────────────

function BookCover({ book, className = '' }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={`aspect-[2/3] overflow-hidden rounded-lg bg-surface-container-high flex items-center justify-center ${className}`}>
      {book?.cover_url && !broken ? (
        <img
          src={book.cover_url}
          alt={book.title}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="material-symbols-outlined text-3xl text-outline/40">menu_book</span>
      )}
    </div>
  )
}

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRating({ value, onChange, readonly = false, size = 'md' }) {
  const [hovered, setHovered] = useState(null)
  const sz = size === 'sm' ? 'text-base' : 'text-xl'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => {
        const filled = (hovered ?? value ?? 0) >= star
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => !readonly && onChange?.(star === value ? 0 : star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            onMouseLeave={() => !readonly && setHovered(null)}
            className={`${sz} transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} ${filled ? 'text-secondary' : 'text-outline/30'}`}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" }}>star</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Weekly Pulse Chart (7-day bar chart with day labels) ─────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function WeeklyPulseChart({ data }) {
  // Use last 7 days of activity data
  const week = data.slice(-7)
  if (week.length === 0) return null
  const max = Math.max(...week.map(d => d.pages_read || 0), 1)
  const todayIdx = week.length - 1

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Weekly Pulse</p>
      <div className="flex items-end gap-1 h-20 relative">
        {week.map((d, i) => {
          const h = ((d.pages_read || 0) / max) * 100
          const isToday = i === todayIdx
          const isActive = (d.pages_read || 0) > 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              {isToday && isActive && (
                <span className="text-[9px] font-bold text-secondary">{d.pages_read}m</span>
              )}
              <div
                className={`w-full rounded-sm transition-all ${
                  isToday && isActive ? 'bg-secondary' : isActive ? 'bg-primary/25' : 'bg-surface-container-high'
                }`}
                style={{ height: `${Math.max(h, isActive ? 8 : 4)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1">
        {DAY_LABELS.slice(0, week.length).map((l, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-on-surface-variant/50 font-medium">{l}</div>
        ))}
      </div>
    </div>
  )
}

// ─── Add Book Modal ───────────────────────────────────────────────────────────

function AddBookModal({ onClose, onAdded }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(null)
  const inputRef = useRef()

  useEffect(() => { inputRef.current?.focus() }, [])

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const data = await searchGoogleBooks(query)
      setResults(data || [])
    } catch { }
    setSearching(false)
  }

  const handleKey = (e) => { if (e.key === 'Enter') search() }

  const handleAdd = async (book, status = 'to-read') => {
    setAdding(book.google_books_id || book.isbn || book.title)
    try {
      await addToLibrary({
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        cover_url: book.cover_url,
        description: book.description,
        total_pages: book.total_pages,
        publisher: book.publisher,
        published_date: book.published_date,
        status,
      })
      onAdded()
      onClose()
    } catch (e) {
      toast(e.message || 'Failed to add book', 'error')
    }
    setAdding(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/20 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-3xl shadow-float w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/15">
          <h2 className="font-serif text-xl font-bold text-primary">Add a Book</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-base">search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Search by title, author, or ISBN..."
                className="w-full bg-surface-container-low rounded-xl pl-9 pr-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={search}
              disabled={searching}
              className="btn-primary px-5 py-3 text-sm rounded-xl shrink-0"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
          {results.length === 0 && !searching && (
            <p className="text-center text-sm text-on-surface-variant py-8">
              Search Google Books to find a title.
            </p>
          )}
          {results.map((book) => {
            const key = book.google_books_id || book.isbn || book.title
            const isAdding = adding === key
            return (
              <div key={key} className="flex gap-4 p-4 bg-surface-container-low rounded-2xl items-start">
                <div className="w-12 shrink-0">
                  <BookCover book={book} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-on-surface truncate">{book.title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{book.author}</p>
                  {book.published_date && (
                    <p className="text-xs text-on-surface-variant/60 mt-0.5">{book.published_date?.slice(0, 4)}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => handleAdd(book, 'to-read')}
                    disabled={isAdding}
                    className="btn-primary px-3 py-1.5 text-xs rounded-lg whitespace-nowrap"
                  >
                    {isAdding ? '...' : 'Want to Read'}
                  </button>
                  <button
                    onClick={() => handleAdd(book, 'reading')}
                    disabled={isAdding}
                    className="border border-primary text-primary px-3 py-1.5 text-xs rounded-lg whitespace-nowrap hover:bg-primary/5 transition-colors"
                  >
                    Reading Now
                  </button>
                  <button
                    onClick={() => handleAdd(book, 'finished')}
                    disabled={isAdding}
                    className="border border-secondary text-secondary px-3 py-1.5 text-xs rounded-lg whitespace-nowrap hover:bg-secondary/5 transition-colors"
                  >
                    Completed
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Book Detail Panel ────────────────────────────────────────────────────────

function BookDetailPanel({ userbook, onClose, onUpdate, onRemove }) {
  const toast = useToast()
  const book = userbook.book
  const [page, setPage] = useState(userbook.current_page || '')
  const [savingProgress, setSavingProgress] = useState(false)
  const [rating, setRating] = useState(userbook.rating || 0)
  const [notes, setNotes] = useState([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [noteText, setNoteText] = useState('')
  const [noteQuote, setNoteQuote] = useState('')
  const [postingNote, setPostingNote] = useState(false)

  useEffect(() => {
    getNotesForBook(userbook.id)
      .then(data => setNotes(data || []))
      .catch(() => {})
      .finally(() => setLoadingNotes(false))
  }, [userbook.id])

  const saveProgress = async () => {
    const p = parseInt(page, 10)
    if (isNaN(p) || p < 0) return
    setSavingProgress(true)
    try {
      await updateProgress(userbook.id, p)
      toast('Progress saved!', 'success')
      onUpdate()
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
    setSavingProgress(false)
  }

  const finish = async () => {
    if (!window.confirm('Mark this book as finished?')) return
    try {
      await markFinished(userbook.id)
      toast('Marked as finished!', 'success')
      onUpdate()
      onClose()
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  const changeStatus = async (newStatus) => {
    try {
      await updateUserBook(userbook.id, { status: newStatus })
      toast(`Moved to ${STATUS_BADGE[newStatus]?.label || newStatus}`, 'success')
      onUpdate()
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  const remove = async () => {
    if (!window.confirm('Remove this book from your library?')) return
    try {
      await removeFromLibrary(userbook.id)
      onRemove(userbook.id)
      onClose()
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  const handleRating = async (stars) => {
    setRating(stars)
    try {
      await updateUserBook(userbook.id, { rating: stars })
      toast(stars ? `Rated ${stars} star${stars > 1 ? 's' : ''}` : 'Rating removed', 'success')
      onUpdate()
    } catch (e) {
      toast(e.message || 'Failed to save rating', 'error')
    }
  }

  const postNote = async () => {
    if (!noteText.trim()) return
    setPostingNote(true)
    try {
      const note = await createNote({
        text: noteText.trim(),
        quote: noteQuote.trim() || null,
        userbook_id: userbook.id,
        is_public: true,
      })
      setNotes(prev => [note, ...prev])
      setNoteText('')
      setNoteQuote('')
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
    setPostingNote(false)
  }

  const removeNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return
    try {
      await deleteNote(noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  const progress = pct(userbook.current_page, book?.total_pages)

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-on-surface/20 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-t-3xl md:rounded-3xl shadow-float w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-outline-variant/15 gap-4">
          <div className="flex gap-4 min-w-0">
            <div className="w-16 shrink-0">
              <BookCover book={book} />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-bold text-primary leading-snug">{book?.title}</h2>
              <p className="text-sm text-on-surface-variant mt-0.5">{book?.author}</p>
              {userbook.status && (
                <span className={`inline-block mt-2 text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[userbook.status]?.cls}`}>
                  {STATUS_BADGE[userbook.status]?.label}
                </span>
              )}
              {userbook.status === 'finished' && (
                <div className="mt-2">
                  <StarRating value={rating} onChange={handleRating} size="sm" />
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-on-surface-variant hover:text-on-surface transition-colors mt-1">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Change status */}
          {userbook.status !== 'reading' && userbook.status !== 'finished' && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Move to</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => changeStatus('reading')}
                  className="btn-primary px-4 py-2 text-sm rounded-xl"
                >
                  Start Reading
                </button>
                <button
                  onClick={() => changeStatus('finished')}
                  className="border border-secondary text-secondary px-4 py-2 text-sm rounded-xl hover:bg-secondary/5 transition-colors"
                >
                  Mark Finished
                </button>
              </div>
            </section>
          )}
          {userbook.status === 'finished' && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Move to</h3>
              <button
                onClick={() => changeStatus('reading')}
                className="border border-primary text-primary px-4 py-2 text-sm rounded-xl hover:bg-primary/5 transition-colors"
              >
                Reading Again
              </button>
            </section>
          )}

          {/* Progress */}
          {userbook.status === 'reading' && (
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Reading Progress</h3>
              {book?.total_pages && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-on-surface-variant">
                    <span>{userbook.current_page || 0} of {book.total_pages} pages</span>
                    <span className="font-bold text-primary">{progress}%</span>
                  </div>
                  <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <input
                  type="number"
                  value={page}
                  onChange={e => setPage(e.target.value)}
                  min="0"
                  max={book?.total_pages || undefined}
                  placeholder="Current page"
                  className="w-32 bg-surface-container-low rounded-xl px-3 py-2 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={saveProgress}
                  disabled={savingProgress}
                  className="btn-primary px-5 py-2 text-sm rounded-xl"
                >
                  {savingProgress ? 'Saving...' : 'Update'}
                </button>
                <button
                  onClick={finish}
                  className="border border-secondary text-secondary px-5 py-2 text-sm rounded-xl hover:bg-secondary/5 transition-colors"
                >
                  Mark Finished
                </button>
              </div>
            </section>
          )}

          {/* Notes */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Notes & Reflections</h3>

            {/* Add note form */}
            <div className="bg-surface-container-low rounded-2xl p-4 space-y-3">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Write a reflection about this book..."
                className="w-full bg-surface-container-lowest rounded-xl p-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] resize-none border-none"
              />
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline/60 text-sm">format_quote</span>
                  <input
                    value={noteQuote}
                    onChange={e => setNoteQuote(e.target.value)}
                    placeholder="Add a quote (optional)..."
                    className="w-full bg-surface-container-lowest rounded-xl pl-8 pr-3 py-2 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button
                  onClick={postNote}
                  disabled={postingNote || !noteText.trim()}
                  className="btn-primary px-4 py-2 text-sm rounded-xl shrink-0 disabled:opacity-50"
                >
                  {postingNote ? '...' : 'Post'}
                </button>
              </div>
            </div>

            {/* Note list */}
            {loadingNotes && <p className="text-xs text-on-surface-variant">Loading notes...</p>}
            {!loadingNotes && notes.length === 0 && (
              <p className="text-sm text-on-surface-variant/60 italic">No notes yet. Write your first reflection above.</p>
            )}
            {notes.map(note => (
              <div key={note.id} className="bg-surface-container-low rounded-2xl p-4 space-y-2">
                <p className="text-sm text-on-surface leading-relaxed">{note.text}</p>
                {note.quote && (
                  <p className="text-sm italic text-on-surface-variant border-l-4 border-secondary/30 pl-3">"{note.quote}"</p>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-on-surface-variant/50">{timeAgo(note.created_at)}</span>
                  <button
                    onClick={() => removeNote(note.id)}
                    className="text-xs text-error/60 hover:text-error transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* Danger zone */}
          <section className="border-t border-outline-variant/15 pt-4">
            <button
              onClick={remove}
              className="text-sm text-error/70 hover:text-error transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">delete</span>
              Remove from library
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── Book Card ─────────────────────────────────────────────────────────────────

// Muted palette for tile backgrounds — deterministic by book id
const TILE_PALETTES = [
  { bg: '#e8e0d4', shadow: 'rgba(139,109,67,0.25)' },   // warm sand
  { bg: '#d4dde0', shadow: 'rgba(60,90,100,0.22)' },     // slate blue
  { bg: '#dde8df', shadow: 'rgba(60,100,70,0.22)' },     // sage green
  { bg: '#e8dde0', shadow: 'rgba(120,70,80,0.22)' },     // dusty rose
  { bg: '#e4e0d8', shadow: 'rgba(90,80,60,0.22)' },      // parchment
  { bg: '#d8dde8', shadow: 'rgba(60,70,120,0.22)' },     // periwinkle
]

const STATUS_COLOR = {
  'reading':  'text-primary',
  'to-read':  'text-tertiary',
  'finished': 'text-secondary',
}

function BookCard({ userbook, onClick }) {
  const book = userbook.book
  const progress = pct(userbook.current_page, book?.total_pages)
  const statusLabel = STATUS_BADGE[userbook.status]?.label?.toUpperCase()
  const statusColor = STATUS_COLOR[userbook.status] || 'text-on-surface-variant'
  const palette = TILE_PALETTES[(userbook.id || 0) % TILE_PALETTES.length]
  const [imgBroken, setImgBroken] = useState(false)

  return (
    <button
      onClick={onClick}
      className="group text-left flex flex-col hover:-translate-y-1 transition-all duration-200"
    >
      {/* Tile — colored bg, perspective 3-D book */}
      <div
        className="relative w-full rounded-2xl overflow-visible flex items-center justify-center"
        style={{
          background: palette.bg,
          paddingTop: '16px',
          paddingBottom: '16px',
          aspectRatio: '3/4',
        }}
      >
        {/* 3-D angled book */}
        <div
          className="relative"
          style={{
            width: '58%',
            perspective: '600px',
          }}
        >
          {/* Main face */}
          <div
            className="relative overflow-hidden rounded-r-sm"
            style={{
              aspectRatio: '2/3',
              transform: 'rotateY(-18deg)',
              transformOrigin: 'left center',
              transformStyle: 'preserve-3d',
              boxShadow: `6px 12px 32px ${palette.shadow}, 2px 4px 8px rgba(0,0,0,0.15)`,
            }}
          >
            {book?.cover_url && !imgBroken ? (
              <img
                src={book.cover_url}
                alt={book.title}
                className="w-full h-full object-cover"
                onError={() => setImgBroken(true)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-surface-container-high px-3 text-center">
                <span className="material-symbols-outlined text-3xl text-outline/40">menu_book</span>
                <p className="text-[10px] font-bold text-on-surface-variant/60 line-clamp-3">{book?.title}</p>
              </div>
            )}
          </div>

          {/* Spine — thin dark sliver on the left */}
          <div
            className="absolute top-0 left-0 h-full rounded-l-sm"
            style={{
              width: '10px',
              background: 'linear-gradient(to right, rgba(0,0,0,0.35), rgba(0,0,0,0.10))',
              transform: 'rotateY(72deg) translateX(-5px)',
              transformOrigin: 'left center',
            }}
          />
        </div>
      </div>

      {/* Info below tile */}
      <div className="pt-3 px-0.5 space-y-1.5">
        <p className="font-serif font-bold text-on-surface leading-snug line-clamp-2 text-sm">{book?.title}</p>
        <p className={`text-xs font-semibold ${statusColor}`}>{book?.author}</p>

        {userbook.status === 'reading' && (
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
              <span className={statusColor}>{statusLabel}</span>
              <span className="text-on-surface-variant/60">{progress}%</span>
            </div>
            <div className="h-1 rounded-full bg-surface-container-high overflow-hidden">
              <div className="h-full bg-secondary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            {book?.total_pages && (
              <p className="text-[10px] text-on-surface-variant/50">
                {userbook.current_page || 0} / {book.total_pages} pages
              </p>
            )}
          </div>
        )}

        {userbook.status === 'finished' && (
          <div className="flex items-center gap-0.5 mt-0.5">
            {[1,2,3,4,5].map(s => (
              <span key={s} className={`material-symbols-outlined text-xs ${(userbook.rating||0) >= s ? 'text-secondary' : 'text-outline/20'}`}
                style={{ fontVariationSettings: (userbook.rating||0) >= s ? "'FILL' 1" : "'FILL' 0", fontSize: '12px' }}>star</span>
            ))}
          </div>
        )}
        {userbook.status !== 'reading' && userbook.status !== 'finished' && statusLabel && (
          <p className={`text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>{statusLabel}</p>
        )}
      </div>
    </button>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function LibrarySidebar({ library, onAddBook }) {
  const [activity, setActivity] = useState([])

  useEffect(() => {
    getMyActivity(7).then(setActivity).catch(() => {})
  }, [])

  const total = library.length
  const totalPages = activity.reduce((s, d) => s + (d.pages_read || 0), 0)

  return (
    <aside className="hidden lg:block col-span-3">
      <div className="bg-surface-container-lowest rounded-3xl p-6 space-y-6 shadow-zen">
        <h3 className="font-serif text-lg font-bold text-on-surface">Reading Stats</h3>

        {/* Weekly pulse chart */}
        <WeeklyPulseChart data={activity} />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-container-low rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Total Books</p>
            <p className="text-2xl font-bold font-serif text-on-surface">{total}</p>
          </div>
          <div className="bg-surface-container-low rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Pages Read</p>
            <p className="text-2xl font-bold font-serif text-on-surface">
              {totalPages >= 1000 ? `${(totalPages / 1000).toFixed(1)}k` : totalPages}
            </p>
          </div>
        </div>

        {/* Add new book CTA */}
        <button
          onClick={onAddBook}
          className="btn-primary w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Add New Book
        </button>
      </div>
    </aside>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [library, setLibrary] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getMyBooks()
      setLibrary(data || [])
    } catch { }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = library.filter(ub => {
    if (activeTab !== 'all') {
      const tab = STATUS_TABS.find(t => t.id === activeTab)
      if (ub.status !== tab?.status) return false
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      const title = ub.book?.title?.toLowerCase() || ''
      const author = ub.book?.author?.toLowerCase() || ''
      if (!title.includes(q) && !author.includes(q)) return false
    }
    return true
  })

  const tabCount = (tab) =>
    tab.id === 'all' ? library.length : library.filter(b => b.status === tab.status).length

  return (
    <main className="pb-16 max-w-screen-2xl mx-auto px-4 md:px-8 lg:px-12 pt-8">
      <div className="grid grid-cols-12 gap-8">
        {/* Main area */}
        <div className="col-span-12 lg:col-span-9 space-y-6">
          {/* Header */}
          <div>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary leading-tight">Your Library</h1>
            <p className="text-on-surface-variant mt-2 text-sm">Curating your personal journey through words and wisdom.</p>
          </div>

          {/* Pill tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary text-on-primary font-bold shadow-sm'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search bar — kept as requested */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-base">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search your library..."
              className="w-full bg-surface-container-low rounded-2xl pl-9 pr-4 py-3 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Loading skeletons */}
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="aspect-[3/4] bg-surface-container animate-pulse rounded-2xl" />
                  <div className="h-3 bg-surface-container animate-pulse rounded w-3/4" />
                  <div className="h-2 bg-surface-container animate-pulse rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-20">
              <span className="material-symbols-outlined text-6xl text-outline/30 block mb-4">auto_stories</span>
              <p className="font-serif text-xl text-on-surface mb-1">
                {search ? 'No matching books' : activeTab === 'all' ? 'Your library is empty' : `No ${STATUS_TABS.find(t => t.id === activeTab)?.label} books`}
              </p>
              <p className="text-sm text-on-surface-variant mt-1">
                {!search && activeTab === 'all' && 'Start building your collection.'}
              </p>
              {!search && activeTab === 'all' && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="btn-primary mt-6 px-6 py-2.5 text-sm rounded-xl"
                >
                  Add your first book
                </button>
              )}
            </div>
          )}

          {/* Book grid */}
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
              {filtered.map(ub => (
                <BookCard
                  key={ub.id}
                  userbook={ub}
                  onClick={() => setSelectedBook(ub)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <LibrarySidebar library={library} onAddBook={() => setShowAddModal(true)} />
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddBookModal
          onClose={() => setShowAddModal(false)}
          onAdded={load}
        />
      )}

      {selectedBook && (
        <BookDetailPanel
          userbook={selectedBook}
          onClose={() => setSelectedBook(null)}
          onUpdate={() => { load(); setSelectedBook(null) }}
          onRemove={(id) => {
            setLibrary(prev => prev.filter(b => b.id !== id))
            setSelectedBook(null)
          }}
        />
      )}
    </main>
  )
}
