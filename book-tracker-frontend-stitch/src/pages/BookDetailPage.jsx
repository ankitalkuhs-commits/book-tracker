import { useState, useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { useTranslation } from 'react-i18next'
import {
  updateProgress, updateUserBook, markFinished, removeFromLibrary,
  getNotesForBook, createNote, deleteNote, getUserbook,
} from '../services/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(current, total) {
  if (!total || !current) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const STATUS_BADGE = {
  'reading':  { labelKey: 'status.reading',    cls: 'bg-primary/10 text-primary' },
  'to-read':  { labelKey: 'status.wantToRead', cls: 'bg-tertiary/10 text-tertiary' },
  'finished': { labelKey: 'status.finished',   cls: 'bg-secondary/10 text-secondary' },
}

function StarRating({ value, onChange, size = 'md' }) {
  const [hover, setHover] = useState(0)
  const sz = size === 'sm' ? 'text-base' : 'text-xl'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(s === value ? 0 : s)}
          className={`material-symbols-outlined ${sz} transition-colors ${
            s <= (hover || value) ? 'text-secondary' : 'text-outline/20'
          }`}
          style={{ fontVariationSettings: s <= (hover || value) ? "'FILL' 1" : "'FILL' 0" }}
        >
          star
        </button>
      ))}
    </div>
  )
}

function BookCover({ book }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="aspect-[2/3] w-full rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center">
      {book?.cover_url && !broken ? (
        <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="material-symbols-outlined text-4xl text-outline/40">menu_book</span>
      )}
    </div>
  )
}

// ── Amazon affiliate helper ───────────────────────────────────────────────────

const AMAZON_TAG_IN  = 'trackmyread-21'
const AMAZON_TAG_COM = 'trackmyread-20'

function getAmazonUrl(title, author) {
  const q  = encodeURIComponent(`${title} ${author || ''}`.trim())
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const india = tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata'
  const domain = india ? 'amazon.in' : 'amazon.com'
  const tag    = india ? AMAZON_TAG_IN : AMAZON_TAG_COM
  return `https://www.${domain}/s?k=${q}&tag=${tag}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BookDetailPage() {
  const { t }             = useTranslation()
  const { state }         = useLocation()
  const { userbookId }    = useParams()
  const navigate          = useNavigate()
  const toast             = useToast()

  const [userbook,       setUserbook]       = useState(state?.userbook || null)
  const [loadingBook,    setLoadingBook]    = useState(!state?.userbook)
  const [status,         setStatus]         = useState(state?.userbook?.status || 'to-read')
  const [page,           setPage]           = useState(state?.userbook?.current_page || '')
  const [displayPage,    setDisplayPage]    = useState(state?.userbook?.current_page || 0)
  const [savingProgress, setSavingProgress] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [rating,         setRating]         = useState(state?.userbook?.rating || 0)
  const [notes,          setNotes]          = useState([])
  const [loadingNotes,   setLoadingNotes]   = useState(false)
  const [noteText,       setNoteText]       = useState('')
  const [noteQuote,      setNoteQuote]      = useState('')
  const [postingNote,    setPostingNote]    = useState(false)
  const [removing,       setRemoving]       = useState(false)
  const [descExpanded,   setDescExpanded]   = useState(false)

  // Fetch userbook from API if page was refreshed (no location.state)
  useEffect(() => {
    if (state?.userbook) return
    if (!userbookId) { navigate('/library', { replace: true }); return }
    getUserbook(userbookId)
      .then(ub => {
        setUserbook(ub)
        setStatus(ub.status || 'to-read')
        setPage(ub.current_page || '')
        setDisplayPage(ub.current_page || 0)
        setRating(ub.rating || 0)
      })
      .catch(() => navigate('/library', { replace: true }))
      .finally(() => setLoadingBook(false))
  }, [userbookId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch notes once userbook is available
  useEffect(() => {
    if (!userbook?.id) return
    setLoadingNotes(true)
    getNotesForBook(userbook.id)
      .then(data => setNotes(data || []))
      .catch(() => {})
      .finally(() => setLoadingNotes(false))
  }, [userbook?.id])

  const STATUS_SEGMENTS = [
    { key: 'to-read',  label: t('status.wantToRead') },
    { key: 'reading',  label: t('status.reading') },
    { key: 'finished', label: t('status.finished') },
  ]

  if (loadingBook) return (
    <main className="max-w-screen-lg mx-auto px-4 pt-16 flex justify-center">
      <span className="text-on-surface-variant text-sm">{t('common.loading')}</span>
    </main>
  )

  const book = userbook?.book

  const handleStatusChange = async (newStatus) => {
    if (newStatus === status) return
    if (status === 'reading' && newStatus === 'to-read') {
      if (!window.confirm('Moving back to "Want to Read" will clear your reading progress. Continue?')) return
    }
    setChangingStatus(true)
    try {
      if (newStatus === 'finished') {
        await markFinished(userbook.id)
      } else {
        await updateUserBook(userbook.id, { status: newStatus })
        if (newStatus === 'reading') {
          const p = parseInt(page, 10)
          if (!isNaN(p) && p > 0) await updateProgress(userbook.id, p)
        }
      }
      setStatus(newStatus)
      toast(`Moved to ${STATUS_BADGE[newStatus]?.label || newStatus}`, 'success')
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
    setChangingStatus(false)
  }

  const saveProgress = async () => {
    const p = parseInt(page, 10)
    if (isNaN(p) || p < 0) return
    const prev = displayPage
    setDisplayPage(p)
    setSavingProgress(true)
    try {
      await updateProgress(userbook.id, p)
      toast('Progress saved!', 'success')
    } catch (e) {
      setDisplayPage(prev)
      toast(e.message || 'Something went wrong', 'error')
    }
    setSavingProgress(false)
  }

  const remove = async () => {
    if (!window.confirm('Remove this book from your library?')) return
    setRemoving(true)
    try {
      await removeFromLibrary(userbook.id)
      navigate('/library', { replace: true })
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
    setRemoving(false)
  }

  const handleRating = async (stars) => {
    setRating(stars)
    try {
      await updateUserBook(userbook.id, { rating: stars })
      toast(stars ? `Rated ${stars} star${stars > 1 ? 's' : ''}` : 'Rating removed', 'success')
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

  const progress = pct(displayPage, book?.total_pages)

  return (
    <main className="max-w-screen-lg mx-auto px-4 md:px-8 pt-6 pb-16">
      {/* Back button */}
      <button
        onClick={() => navigate('/library')}
        className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors mb-6"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        {t('library.backToLibrary')}
      </button>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">

        {/* Left column — cover + meta */}
        <div className="md:col-span-4 lg:col-span-3 space-y-5">
          <BookCover book={book} />

          {/* Star rating (always visible) */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('book.yourRating')}</p>
            <StarRating value={rating} onChange={handleRating} />
          </div>

          {/* Book meta */}
          {(book?.publisher || book?.published_date || book?.total_pages) && (
            <div className="space-y-1.5 text-sm text-on-surface-variant border-t border-outline-variant/15 pt-4">
              {book?.published_date && <p><span className="font-medium text-on-surface">{t('book.published')}:</span> {book.published_date}</p>}
              {book?.publisher     && <p><span className="font-medium text-on-surface">{t('book.publisher')}:</span> {book.publisher}</p>}
              {book?.total_pages   && <p><span className="font-medium text-on-surface">{t('book.pages')}:</span> {book.total_pages}</p>}
              {book?.isbn          && <p><span className="font-medium text-on-surface">{t('book.isbn')}:</span> {book.isbn}</p>}
            </div>
          )}

          {/* Buy on Amazon */}
          {book?.title && (
            <a
              href={getAmazonUrl(book.title, book.author)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors text-sm font-semibold"
            >
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
              {t('book.buyOnAmazon')}
            </a>
          )}
          <p className="text-center text-xs text-on-surface-variant/50 -mt-2">{t('book.affiliateDisclaimer')}</p>
        </div>

        {/* Right column — main content */}
        <div className="md:col-span-8 lg:col-span-9 space-y-8">

          {/* Title + author */}
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-primary leading-tight">{book?.title}</h1>
            <p className="text-lg text-on-surface-variant mt-1">{book?.author}</p>
            {STATUS_BADGE[status] && (
              <span className={`inline-block mt-3 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${STATUS_BADGE[status].cls}`}>
                {t(STATUS_BADGE[status].labelKey)}
              </span>
            )}
          </div>

          {/* Description */}
          {book?.description && (
            <section>
              <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-2">{t('book.aboutThisBook')}</h2>
              <p className={`text-sm text-on-surface-variant leading-relaxed ${!descExpanded ? 'line-clamp-4' : ''}`}>
                {book.description}
              </p>
              {book.description.length > 300 && (
                <button
                  onClick={() => setDescExpanded(v => !v)}
                  className="text-xs text-primary font-medium mt-1 hover:underline"
                >
                  {descExpanded ? t('book.showLess') : t('book.readMore')}
                </button>
              )}
            </section>
          )}

          {/* Status selector */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">{t('book.sectionStatus')}</h2>
            <div className="flex rounded-2xl overflow-hidden border border-outline-variant/20 divide-x divide-outline-variant/20">
              {STATUS_SEGMENTS.map(seg => (
                <button
                  key={seg.key}
                  onClick={() => handleStatusChange(seg.key)}
                  disabled={changingStatus}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                    status === seg.key
                      ? seg.key === 'finished' ? 'bg-secondary text-on-secondary'
                        : seg.key === 'reading' ? 'bg-primary text-on-primary'
                        : 'bg-tertiary text-on-tertiary'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {changingStatus && status !== seg.key ? '…' : seg.label}
                </button>
              ))}
            </div>
          </section>

          {/* Progress */}
          {status === 'reading' && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">{t('book.sectionProgress')}</h2>
              {book?.total_pages && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-on-surface-variant">
                    <span>{t('book.pagesProgress', { current: displayPage, total: book.total_pages })}</span>
                    <span className="font-bold text-primary">{progress}%</span>
                  </div>
                  <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              <div className="flex gap-3 items-center">
                <input
                  type="number"
                  value={page}
                  onChange={e => setPage(e.target.value)}
                  min="0"
                  max={book?.total_pages || undefined}
                  placeholder={t('book.currentPagePlaceholder')}
                  className="w-40 bg-surface-container-low rounded-xl px-3 py-2 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={saveProgress}
                  disabled={savingProgress}
                  className="btn-primary px-5 py-2 text-sm rounded-xl"
                >
                  {savingProgress ? t('common.saving') : t('book.updateProgress')}
                </button>
              </div>
            </section>
          )}

          {/* Notes */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">{t('book.sectionNotes')}</h2>

            <div className="bg-surface-container-low rounded-2xl p-4 space-y-3">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder={t('book.writeReflection')}
                className="w-full bg-surface-container-lowest rounded-xl p-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[90px] resize-none border-none"
              />
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline/60 text-sm">format_quote</span>
                  <input
                    value={noteQuote}
                    onChange={e => setNoteQuote(e.target.value)}
                    placeholder={t('book.addQuoteOptional')}
                    className="w-full bg-surface-container-lowest rounded-xl pl-8 pr-3 py-2 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button
                  onClick={postNote}
                  disabled={postingNote || !noteText.trim()}
                  className="btn-primary px-4 py-2 text-sm rounded-xl shrink-0 disabled:opacity-50"
                >
                  {postingNote ? '…' : t('common.post')}
                </button>
              </div>
            </div>

            {loadingNotes && <p className="text-xs text-on-surface-variant">{t('book.loadingNotes')}</p>}
            {!loadingNotes && notes.length === 0 && (
              <p className="text-sm text-on-surface-variant/60 italic">{t('book.noNotesYet')}</p>
            )}
            {notes.map(note => (
              <div key={note.id} className="bg-surface-container-low rounded-2xl p-4 space-y-2">
                <p className="text-sm text-on-surface leading-relaxed">{note.text}</p>
                {note.quote && (
                  <p className="text-sm italic text-on-surface-variant border-l-4 border-secondary/30 pl-3">"{note.quote}"</p>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-on-surface-variant/50">{timeAgo(note.created_at)}</span>
                  <button onClick={() => removeNote(note.id)} className="text-xs text-error/60 hover:text-error transition-colors">{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </section>

          {/* Remove */}
          <section className="border-t border-outline-variant/15 pt-4">
            <button
              onClick={remove}
              disabled={removing}
              className="text-sm text-error/70 hover:text-error transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">{removing ? 'progress_activity' : 'delete'}</span>
              {removing ? t('common.loading') : t('book.removeFromLibrary')}
            </button>
          </section>
        </div>
      </div>
    </main>
  )
}
