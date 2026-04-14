import { useState, useEffect, useRef } from 'react'
import { useToast } from '../components/Toast'
import {
  getMyBooks, updateProgress, markFinished, removeFromLibrary,
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

// ─── Activity Sparkline (SVG bar chart) ───────────────────────────────────────

function ActivityChart({ data }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map(d => d.pages_read || 0), 1)
  const bars = data.slice(-30)
  const barW = 100 / bars.length

  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-16">
      {bars.map((d, i) => {
        const h = ((d.pages_read || 0) / max) * 36
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={40 - h}
            width={barW - 1}
            height={h}
            rx="1"
            className="fill-primary/30 hover:fill-primary/60 transition-colors"
          />
        )
      })}
    </svg>
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
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-on-surface-variant hover:text-on-surface transition-colors mt-1">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
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

function BookCard({ userbook, onClick }) {
  const book = userbook.book
  const badge = STATUS_BADGE[userbook.status]
  const progress = pct(userbook.current_page, book?.total_pages)

  return (
    <button
      onClick={onClick}
      className="bg-surface-container-lowest rounded-2xl overflow-hidden hover:shadow-[0_16px_40px_-12px_rgba(0,70,74,0.12)] transition-all group text-left flex flex-col"
    >
      {/* Cover */}
      <div className="relative w-full">
        <BookCover book={book} className="!rounded-none w-full" />
        {userbook.status === 'reading' && book?.total_pages && (
          <div className="absolute bottom-0 left-0 w-full h-1.5 bg-on-surface/10">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}
        {badge && (
          <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex-1 flex flex-col">
        <p className="font-bold text-sm text-on-surface leading-snug line-clamp-2">{book?.title}</p>
        <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">{book?.author}</p>
        {userbook.status === 'reading' && book?.total_pages && (
          <p className="text-xs text-primary font-bold mt-auto pt-2">{progress}% complete</p>
        )}
      </div>
    </button>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function LibrarySidebar({ library }) {
  const [activity, setActivity] = useState([])

  useEffect(() => {
    getMyActivity(30).then(setActivity).catch(() => {})
  }, [])

  const total = library.length
  const reading = library.filter(b => b.status === 'reading').length
  const finished = library.filter(b => b.status === 'finished').length
  const totalPages = activity.reduce((s, d) => s + (d.pages_read || 0), 0)

  return (
    <aside className="hidden lg:flex col-span-3 flex-col space-y-5">
      {/* Stats */}
      <section className="bg-surface-container-low rounded-3xl p-6 space-y-4">
        <h3 className="font-serif text-lg font-bold text-primary">Your Reading</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: total },
            { label: 'Reading', value: reading },
            { label: 'Finished', value: finished },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface-container-lowest rounded-2xl p-3 text-center">
              <p className="text-2xl font-bold font-serif text-primary">{value}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 30-day activity */}
      {activity.length > 0 && (
        <section className="bg-surface-container-low rounded-3xl p-6 space-y-3">
          <div className="flex justify-between items-baseline">
            <h3 className="font-serif text-base font-bold text-primary">30-Day Pulse</h3>
            <span className="text-xs text-on-surface-variant">{totalPages} pages</span>
          </div>
          <ActivityChart data={activity} />
          <p className="text-xs text-on-surface-variant/60 text-center">Pages read per day</p>
        </section>
      )}

      {/* Currently reading list */}
      {reading > 0 && (
        <section className="bg-surface-container-low rounded-3xl p-6 space-y-4">
          <h3 className="font-serif text-base font-bold text-primary">In Progress</h3>
          <div className="space-y-3">
            {library.filter(b => b.status === 'reading').slice(0, 4).map(ub => (
              <div key={ub.id} className="flex gap-3 items-center">
                <div className="w-9 shrink-0">
                  <BookCover book={ub.book} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-bold text-on-surface truncate">{ub.book?.title}</p>
                  {ub.book?.total_pages && (
                    <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${pct(ub.current_page, ub.book.total_pages)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
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
    <main className="pb-12 max-w-screen-2xl mx-auto px-4 md:px-8 lg:px-12 pt-8">
      <div className="grid grid-cols-12 gap-8">
        {/* Main area */}
        <div className="col-span-12 lg:col-span-9 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-3xl font-bold text-primary">My Library</h1>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary px-5 py-2.5 text-sm rounded-xl flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Add Book
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-outline-variant/15 overflow-x-auto">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-4 text-sm font-sans whitespace-nowrap transition-colors flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'text-primary font-bold border-b-2 border-primary'
                    : 'text-on-surface-variant/60 font-medium hover:text-on-surface'
                }`}
              >
                {tab.label}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'
                }`}>
                  {tabCount(tab)}
                </span>
              </button>
            ))}
          </div>

          {/* Search within library */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline/60 text-base">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search your library..."
              className="w-full bg-surface-container-low rounded-xl pl-9 pr-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden">
                  <div className="aspect-[2/3] bg-surface-container animate-pulse" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-surface-container animate-pulse rounded" />
                    <div className="h-2 w-2/3 bg-surface-container animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-20 text-on-surface-variant">
              <span className="material-symbols-outlined text-6xl text-outline/40 block mb-4">auto_stories</span>
              <p className="font-serif text-xl text-on-surface mb-2">
                {search ? 'No matching books' : activeTab === 'all' ? 'Your library is empty' : `No ${STATUS_TABS.find(t => t.id === activeTab)?.label} books`}
              </p>
              <p className="text-sm">
                {!search && activeTab === 'all' && 'Start building your collection!'}
              </p>
              {!search && activeTab === 'all' && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="btn-primary mt-5 px-6 py-2.5 text-sm rounded-xl"
                >
                  Add your first book
                </button>
              )}
            </div>
          )}

          {/* Book grid */}
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
        <LibrarySidebar library={library} />
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
