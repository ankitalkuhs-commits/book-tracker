import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { addToLibrary, getMyBooks } from '../services/api'
import { useToast } from './Toast'

// ── Amazon helper ─────────────────────────────────────────────────────────────

const AMAZON_TAG_IN  = 'trackmyread-21'
const AMAZON_TAG_COM = 'trackmyread-20'

function getAmazonUrl(title, author) {
  const q     = encodeURIComponent(`${title} ${author || ''}`.trim())
  const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone
  const india = tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata'
  return `https://www.${india ? 'amazon.in' : 'amazon.com'}/s?k=${q}&tag=${india ? AMAZON_TAG_IN : AMAZON_TAG_COM}`
}

// ── Modal ─────────────────────────────────────────────────────────────────────

const STATUS_KEYS = [
  { key: 'to-read',  labelKey: 'status.wantToRead' },
  { key: 'reading',  labelKey: 'status.reading' },
  { key: 'finished', labelKey: 'status.finished' },
]

export default function BookPreviewModal({ book: rawBook, onClose }) {
  // Normalize: accept either a flat book or a userbook with nested book
  const book     = rawBook?.book || rawBook
  const { t }    = useTranslation()
  const navigate = useNavigate()
  const toast    = useToast()

  const [myUserbook,     setMyUserbook]     = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [adding,         setAdding]         = useState(false)
  const [selectedStatus, setSelectedStatus] = useState(null)

  useEffect(() => {
    getMyBooks()
      .then(books => {
        const found = (books || []).find(ub =>
          (book?.id           && ub.book?.id           === book.id) ||
          (book?.google_books_id && ub.book?.google_books_id === book.google_books_id)
        )
        setMyUserbook(found || null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async () => {
    if (!selectedStatus) return
    setAdding(true)
    try {
      const result = await addToLibrary({
        google_books_id: book.google_books_id || book.google_id || null,
        title:       book.title,
        author:      book.author || '',
        cover_url:   book.cover_url || null,
        total_pages: book.total_pages || null,
        status: selectedStatus,
      })
      setMyUserbook(result)
      toast('Added to your library!', 'success')
    } catch (e) {
      toast(e.message || 'Could not add book', 'error')
    }
    setAdding(false)
  }

  if (!book) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-on-surface/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-float w-full sm:max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-outline-variant/15">
          <h2 className="font-serif text-lg font-bold text-on-surface">{t('book.aboutThisBook')}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Book info */}
          <div className="flex gap-4 items-start">
            <div className="w-20 shrink-0">
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-surface-container-high shadow-md">
                {book.cover_url
                  ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl text-outline/40">menu_book</span>
                    </div>
                }
              </div>
            </div>
            <div className="flex-1 min-w-0 pt-1 space-y-1">
              <p className="font-serif font-bold text-on-surface leading-snug">{book.title}</p>
              {book.author      && <p className="text-sm text-primary font-semibold">{book.author}</p>}
              {book.total_pages && <p className="text-xs text-on-surface-variant">{book.total_pages} pages</p>}
            </div>
          </div>

          {/* Description */}
          {book.description && (
            <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-4">{book.description}</p>
          )}

          {/* Amazon */}
          <a
            href={getAmazonUrl(book.title, book.author)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors text-sm font-semibold"
          >
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
            {t('book.buyOnAmazon')}
          </a>
          <p className="text-center text-xs text-on-surface-variant/40 -mt-3">{t('book.affiliateDisclaimer')}</p>

          {/* Library actions */}
          {loading ? (
            <div className="flex justify-center py-2">
              <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
            </div>
          ) : myUserbook ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-secondary font-semibold text-sm">
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                {t('book.alreadyInLibrary')}
              </div>
              <button
                onClick={() => { navigate(`/library/book/${myUserbook.id}`, { state: { userbook: myUserbook } }); onClose() }}
                className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm hover:bg-primary/90 transition-colors"
              >
                {t('book.viewInMyLibrary')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant text-center">{t('book.addToLibrarySection')}</p>
              <div className="flex gap-2">
                {STATUS_KEYS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedStatus(opt.key)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      selectedStatus === opt.key
                        ? 'bg-primary text-on-primary border-primary'
                        : 'border-outline-variant/40 text-on-surface-variant hover:border-primary/40'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <button
                onClick={handleAdd}
                disabled={!selectedStatus || adding}
                className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {adding ? t('common.loading') : t('library.addToLibrary')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
