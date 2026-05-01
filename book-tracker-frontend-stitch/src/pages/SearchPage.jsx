import { useState, useEffect, useRef } from 'react'
import { searchGoogleBooks, searchLocalBooks, addToLibrary } from '../services/api'
import { useToast } from '../components/Toast'

const GENRES = [
  { key: 'all',       label: 'All' },
  { key: 'fiction',   label: 'Fiction' },
  { key: 'fantasy',   label: 'Fantasy' },
  { key: 'mystery',   label: 'Mystery' },
  { key: 'thriller',  label: 'Thriller' },
  { key: 'sci-fi',    label: 'Sci-Fi' },
  { key: 'romance',   label: 'Romance' },
  { key: 'historical',label: 'Historical' },
  { key: 'literary',  label: 'Literary' },
]

const STATUS_OPTIONS = [
  { value: 'to-read',  label: 'Want to Read' },
  { value: 'reading',  label: 'Reading Now' },
  { value: 'finished', label: 'Already Read' },
]

const FORMAT_OPTIONS = [
  { key: 'all',       label: 'All formats' },
  { key: 'paperback', label: 'Paperback' },
  { key: 'hardcover', label: 'Hardcover' },
  { key: 'ebook',     label: 'eBook' },
  { key: 'audiobook', label: 'Audiobook' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractYear(d) {
  if (!d) return null
  const m = d.match(/\d{4}/)
  return m ? m[0] : null
}

function primaryCategory(categories) {
  if (!categories?.length) return null
  const parts = categories[0].split('/').map(p => p.trim())
  return parts[parts.length - 1]
}

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

function StarRow({ rating, count }) {
  if (!rating) return null
  const stars = Math.round(rating)
  const label = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count
  return (
    <div className="flex items-center gap-0.5 text-secondary text-xs">
      {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
      {count ? <span className="text-outline/60 ml-1">{label}</span> : null}
    </div>
  )
}

function BookResult({ book }) {
  const [status, setStatus] = useState('to-read')
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const genre = primaryCategory(book.categories)
  const year  = extractYear(book.published_date)

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
      <div className="flex-1 min-w-0 space-y-1.5">
        <h3 className="font-bold text-on-surface leading-snug">{book.title}</h3>
        <p className="text-sm text-on-surface-variant">{book.author}</p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          {genre && (
            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {genre}
            </span>
          )}
          {year && <span className="text-xs text-outline/60">{year}</span>}
          {book.total_pages > 0 && (
            <span className="text-xs text-outline/50">{book.total_pages} pp</span>
          )}
        </div>

        <StarRow rating={book.average_rating} count={book.ratings_count} />

        {book.description && (
          <p className="text-xs text-on-surface-variant/70 line-clamp-2 leading-relaxed">{book.description}</p>
        )}

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
              {adding ? 'Adding…' : 'Add to Library'}
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
  const [query,         setQuery]         = useState('')
  const [tab,           setTab]           = useState('google')    // 'google' | 'community'
  const [activeGenre,   setActiveGenre]   = useState('all')
  const [activeFormat,  setActiveFormat]  = useState('all')
  const [activeSort,    setActiveSort]    = useState('relevance') // 'relevance' | 'newest'
  const [googleResults, setGoogleResults] = useState([])
  const [localResults,  setLocalResults]  = useState([])
  const [loading,       setLoading]       = useState(false)
  const [loadingMore,   setLoadingMore]   = useState(false)
  const [searched,      setSearched]      = useState(false)
  const [startIndex,    setStartIndex]    = useState(0)
  const [hasMore,       setHasMore]       = useState(false)
  const debounceRef = useRef()

  const PAGE_SIZE = 10

  const doSearch = async (q = query, genre = activeGenre, sort = activeSort, append = false) => {
    if (!q.trim()) return
    const idx = append ? startIndex : 0
    if (!append) {
      setLoading(true)
      setSearched(true)
      setStartIndex(0)
      setHasMore(false)
    } else {
      setLoadingMore(true)
    }
    try {
      const [google, local] = await Promise.allSettled([
        searchGoogleBooks(q, { genre, orderBy: sort, startIndex: idx }),
        !append ? searchLocalBooks(q) : Promise.resolve(localResults),
      ])
      const googleData   = google.status === 'fulfilled' ? google.value : { results: [], has_more: false, next_start_index: 0 }
      const newGoogle    = googleData.results || []
      if (append) {
        setGoogleResults(prev => {
          const seen = new Set(prev.map(r => r.google_id || r.google_books_id))
          return [...prev, ...newGoogle.filter(r => !seen.has(r.google_id || r.google_books_id))]
        })
      } else {
        setGoogleResults(newGoogle)
        setLocalResults(local.status === 'fulfilled' ? (local.value || []) : [])
      }
      setHasMore(googleData.has_more ?? false)
      setStartIndex(googleData.next_start_index ?? 0)
    } catch {
      if (!append) { setGoogleResults([]); setLocalResults([]) }
    }
    setLoading(false)
    setLoadingMore(false)
  }

  // Re-run search when genre or sort changes (Google tab only)
  const handleGenreChange = (g) => {
    setActiveGenre(g)
    if (tab === 'google' && searched && query.trim()) doSearch(query, g, activeSort)
  }
  const handleSortChange = (s) => {
    setActiveSort(s)
    if (tab === 'google' && searched && query.trim()) doSearch(query, activeGenre, s)
  }

  // Debounce community search as user types
  useEffect(() => {
    if (tab !== 'community' || !query.trim()) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 350)
    return () => clearTimeout(debounceRef.current)
  }, [query, tab])

  const handleKey = (e) => { if (e.key === 'Enter') doSearch() }

  const resetTab = (newTab) => {
    setTab(newTab)
    setSearched(false)
    setQuery('')
    setGoogleResults([])
    setLocalResults([])
    setStartIndex(0)
    setHasMore(false)
  }

  const filterByFormat = (books) => {
    if (activeFormat === 'all') return books
    return books.filter(b => {
      const binding = (b.binding || b.format || '').toLowerCase()
      if (activeFormat === 'ebook')     return binding.includes('ebook') || binding.includes('kindle') || binding.includes('digital')
      if (activeFormat === 'audiobook') return binding.includes('audio')
      if (activeFormat === 'paperback') return binding.includes('paper') || (!binding && true) // default
      if (activeFormat === 'hardcover') return binding.includes('hard')
      return true
    })
  }

  const activeResults = tab === 'google' ? filterByFormat(googleResults) : localResults

  return (
    <main className="pb-12 max-w-screen-lg mx-auto px-4 md:px-8 pt-8 space-y-6">
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
            placeholder="Title, author, or ISBN…"
            className="w-full bg-surface-container-low rounded-2xl pl-12 pr-5 py-3.5 text-base border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            autoFocus
          />
        </div>
        <button onClick={() => doSearch()} disabled={loading} className="btn-primary px-7 py-3.5 text-base rounded-2xl shrink-0">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Genre chips (Google tab only) */}
      {tab === 'google' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {GENRES.map(g => (
              <button
                key={g.key}
                onClick={() => handleGenreChange(g.key)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  activeGenre === g.key
                    ? 'bg-primary text-on-primary border-primary font-bold'
                    : 'bg-surface-container-lowest text-on-surface-variant border-outline/30 hover:border-primary/40'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {FORMAT_OPTIONS.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFormat(f.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  activeFormat === f.key
                    ? 'bg-secondary text-on-secondary border-secondary font-bold'
                    : 'bg-surface-container-lowest text-on-surface-variant border-outline/30 hover:border-secondary/40'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs + Sort row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => resetTab('google')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === 'google' ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            Google Books
            {searched && tab === 'google' && googleResults.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-on-primary/20 rounded-full px-1.5 py-0.5">{googleResults.length}</span>
            )}
          </button>
          <button
            onClick={() => resetTab('community')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === 'community' ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            Community Library
            {searched && tab === 'community' && localResults.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-on-primary/20 rounded-full px-1.5 py-0.5">{localResults.length}</span>
            )}
          </button>
        </div>

        {/* Sort (Google only, after search) */}
        {tab === 'google' && searched && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-outline">Sort:</span>
            {[['relevance','Relevance'],['newest','Newest']].map(([k,l]) => (
              <button
                key={k}
                onClick={() => handleSortChange(k)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  activeSort === k
                    ? 'bg-primary-container text-on-primary font-bold'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
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
              : 'Try a different genre filter or search term.'}
          </p>
        </div>
      )}

      {/* Empty initial state */}
      {!loading && !searched && (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-6xl text-outline/30 block mb-4">auto_stories</span>
          <p className="font-serif text-xl text-on-surface/60">Search for any book</p>
          <p className="text-sm text-on-surface-variant/60 mt-1">
            {tab === 'community' ? 'Find books already in the TrackMyRead community' : 'Powered by Google Books — results filtered for novel readers'}
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && activeResults.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">
            {activeResults.length} result{activeResults.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
            {tab === 'community' && (
              <span className="ml-2 text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">Community catalog</span>
            )}
          </p>
          {activeResults.map((book, i) => (
            <BookResult key={book.google_id || book.google_books_id || book.isbn || book.id || i} book={book} />
          ))}

          {/* Load More */}
          {tab === 'google' && hasMore && (
            <div className="text-center pt-4">
              <button
                onClick={() => doSearch(query, activeGenre, activeSort, true)}
                disabled={loadingMore}
                className="btn-secondary px-8 py-3 rounded-2xl text-sm font-medium"
              >
                {loadingMore ? 'Loading…' : 'Load more books'}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
