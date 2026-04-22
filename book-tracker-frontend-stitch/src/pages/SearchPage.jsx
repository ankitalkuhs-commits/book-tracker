import { useState, useEffect, useRef } from 'react'
import { searchGoogleBooks, searchLocalBooks, addToLibrary } from '../services/api'
import { useToast } from '../components/Toast'

const STATUS_OPTIONS = [
  { value: 'to-read',  label: 'Want to Read' },
  { value: 'reading',  label: 'Reading Now' },
  { value: 'finished', label: 'Already Read' },
]

function BookCover({ book }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="aspect-[2/3] rounded-lg overflow-hidden bg-surface-container-high flex items-center justify-center">
      {book?.cover_url && !broken ? (
        <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="material-symbols-outlined text-3xl text-outline/40">menu_book</span>
      )}
    </div>
  )
}

function BookResult({ book }) {
  const [status, setStatus] = useState('to-read')
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const handleAdd = async () => {
    setAdding(true)
    setError(null)
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
      setAdded(true)
      toast(`"${book.title}" added to library`, 'success')
    } catch (e) {
      const msg = e.message || 'Failed to add'
      setError(msg)
      toast(msg, 'error')
    }
    setAdding(false)
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 flex gap-5 hover:shadow-[0_12px_32px_-8px_rgba(0,70,74,0.08)] transition-all">
      <div className="w-20 shrink-0"><BookCover book={book} /></div>
      <div className="flex-1 min-w-0 space-y-2">
        <h3 className="font-bold text-on-surface leading-snug">{book.title}</h3>
        <p className="text-sm text-on-surface-variant">{book.author}</p>
        {book.published_date && <p className="text-xs text-on-surface-variant/60">{book.published_date?.slice(0, 4)}</p>}
        {book.description && <p className="text-xs text-on-surface-variant/70 line-clamp-2 leading-relaxed">{book.description}</p>}
        {book.total_pages && <p className="text-xs text-on-surface-variant/50">{book.total_pages} pages</p>}
        {added ? (
          <div className="flex items-center gap-2 pt-1">
            <span className="material-symbols-outlined text-secondary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <span className="text-sm font-medium text-secondary">Added to library</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="bg-surface-container-low rounded-xl px-3 py-2 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={handleAdd} disabled={adding} className="btn-primary px-4 py-2 text-sm rounded-xl">
              {adding ? 'Adding...' : 'Add to Library'}
            </button>
            {error && <span className="text-xs text-error">{error}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-surface-container-lowest rounded-2xl p-5 flex gap-5">
          <div className="w-20 aspect-[2/3] bg-surface-container animate-pulse rounded-lg shrink-0" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="h-4 bg-surface-container animate-pulse rounded w-3/4" />
            <div className="h-3 bg-surface-container animate-pulse rounded w-1/2" />
            <div className="h-3 bg-surface-container animate-pulse rounded w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('google') // 'google' | 'community'
  const [googleResults, setGoogleResults] = useState([])
  const [localResults, setLocalResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef()

  const doSearch = async (q = query) => {
    if (!q.trim()) return
    setLoading(true)
    setSearched(true)
    try {
      const [google, local] = await Promise.allSettled([
        searchGoogleBooks(q),
        searchLocalBooks(q),
      ])
      setGoogleResults(google.status === 'fulfilled' ? (google.value || []) : [])
      setLocalResults(local.status === 'fulfilled' ? (local.value || []) : [])
    } catch {
      setGoogleResults([])
      setLocalResults([])
    }
    setLoading(false)
  }

  // Debounce local search as user types (community tab)
  useEffect(() => {
    if (tab !== 'community' || !query.trim()) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 350)
    return () => clearTimeout(debounceRef.current)
  }, [query, tab])

  const handleKey = (e) => { if (e.key === 'Enter') doSearch() }

  const activeResults = tab === 'google' ? googleResults : localResults

  return (
    <main className="pb-12 max-w-screen-lg mx-auto px-4 md:px-8 pt-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-bold text-primary">Find Books</h1>
        <p className="text-on-surface-variant text-sm mt-1">Search Google Books or see what the community is reading.</p>
      </div>

      {/* Search bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline/60">search</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search by title, author, or ISBN..."
            className="w-full bg-surface-container-low rounded-2xl pl-12 pr-5 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            autoFocus
          />
        </div>
        <button onClick={() => doSearch()} disabled={loading} className="btn-primary px-7 py-3.5 text-base rounded-2xl shrink-0">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => { setTab('google'); setSearched(false); setQuery(''); setGoogleResults([]); setLocalResults([]) }}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === 'google' ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
        >
          Google Books
          {searched && tab === 'google' && googleResults.length > 0 && (
            <span className="ml-1.5 text-[10px] bg-on-primary/20 rounded-full px-1.5 py-0.5">{googleResults.length}</span>
          )}
        </button>
        <button
          onClick={() => { setTab('community'); setSearched(false); setQuery(''); setGoogleResults([]); setLocalResults([]) }}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === 'community' ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
        >
          Community Library
          {searched && tab === 'community' && localResults.length > 0 && (
            <span className="ml-1.5 text-[10px] bg-on-primary/20 rounded-full px-1.5 py-0.5">{localResults.length}</span>
          )}
        </button>
      </div>

      {/* Loading */}
      {loading && <SkeletonList />}

      {/* No results */}
      {!loading && searched && activeResults.length === 0 && (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-6xl text-outline/40 block mb-4">
            {tab === 'community' ? 'library_books' : 'search_off'}
          </span>
          <p className="font-serif text-xl text-on-surface">
            {tab === 'community' ? 'Not in the community catalog yet' : 'No books found'}
          </p>
          <p className="text-sm text-on-surface-variant mt-1">
            {tab === 'community'
              ? 'Be the first to add this book via Google Books.'
              : 'Try a different title or author name.'}
          </p>
        </div>
      )}

      {/* Empty initial state */}
      {!loading && !searched && (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-6xl text-outline/30 block mb-4">auto_stories</span>
          <p className="font-serif text-xl text-on-surface/60">Search for any book</p>
          <p className="text-sm text-on-surface-variant/60 mt-1">
            {tab === 'community' ? 'Find books already in the TrackMyRead community' : 'Powered by Google Books — millions of titles'}
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && activeResults.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">
            {activeResults.length} result{activeResults.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
            {tab === 'community' && <span className="ml-2 text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">Community catalog</span>}
          </p>
          {activeResults.map((book, i) => (
            <BookResult key={book.isbn || book.google_books_id || book.id || i} book={book} />
          ))}
        </div>
      )}
    </main>
  )
}
