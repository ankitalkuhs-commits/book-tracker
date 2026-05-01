/**
 * AppTour — in-app spotlight coach marks.
 *
 * 8 steps total:
 *   1-4  Informational: spotlight on each nav tab
 *   5    Setup: choose avatar / upload photo
 *   6    Setup: set reading goal
 *   7    Setup: add first book (search)
 *   8    Done
 *
 * Reset for all users: bump ONBOARDING_KEY below.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { ONBOARDING_KEY } from '../pages/OnboardingPage'
import { updateMyProfile, uploadProfilePicture, searchGoogleBooks, addToLibrary } from '../services/api'

const PAD = 8

// ── Preset avatars (DiceBear) — synced with mobile ───────────────────────────
const AVATAR_SEEDS = ['Aneka','Buster','Callie','Destiny','Emery','Felix','Gracie','Harley']
const AVATAR_BGS   = ['c8e6f5','dcc8f0','c8e6c9','f5dcc8','f5c8c8','c8ddf5','e8c8f5','f5f0c8']
const PRESET_AVATARS = AVATAR_SEEDS.map((seed, i) => ({
  id: seed,
  url: `https://api.dicebear.com/9.x/adventurer/png?seed=${seed}&size=200&backgroundColor=${AVATAR_BGS[i]}`,
}))

const GOAL_PRESETS = [6, 12, 24, 36, 52]

// ── Step definitions ──────────────────────────────────────────────────────────
// type 'nav'    → spotlight on a nav element, small tooltip below it
// type 'setup'  → full-overlay card (avatar / goal / book)
// type 'done'   → full-overlay completion card

const STEPS = [
  { type: 'nav',   target: '[data-tour="home"]',     placement: 'bottom',     title: 'Your Reading Feed',    body: 'See what friends are reading, their highlights and milestones — in real time.' },
  { type: 'nav',   target: '[data-tour="library"]',  placement: 'bottom',     title: 'Your Library',         body: 'Track every book — currently reading, want to read, and finished.' },
  { type: 'nav',   target: '[data-tour="groups"]',   placement: 'bottom',     title: 'Reading Circles',      body: 'Join circles, compete on leaderboards, and discuss books with friends.' },
  { type: 'nav',   target: '[data-tour="insights"]', placement: 'bottom',     title: 'Track Your Progress',  body: 'See streaks, pages per day, and yearly goal — all visualised.' },
  { type: 'setup', id: 'avatar', title: '📸 Add a Profile Photo',  body: 'Pick a character or upload your own photo. Friends will recognise you in the feed.' },
  { type: 'setup', id: 'goal',   title: '🎯 Set a Reading Goal',   body: 'How many books do you want to read this year? You can change this anytime in Settings.' },
  { type: 'setup', id: 'book',   title: '📚 Add Your First Book',  body: 'What are you reading right now? Search and add it to your library.' },
  { type: 'done' },
]

function getRect(selector) {
  if (!selector) return null
  const el = document.querySelector(selector)
  return el ? el.getBoundingClientRect() : null
}

// ── Avatar step ───────────────────────────────────────────────────────────────
function AvatarStep({ onSave }) {
  const [selected, setSelected]   = useState(null)
  const [saving,   setSaving]     = useState(false)
  const [uploading,setUploading]  = useState(false)
  const fileRef                   = useRef()

  const handlePreset = (av) => setSelected({ type: 'preset', url: av.url, id: av.id })

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { profile_picture } = await uploadProfilePicture(file)
      setSelected({ type: 'upload', url: profile_picture })
    } catch { /* ignore */ }
    setUploading(false)
  }

  const handleSave = async () => {
    if (!selected) { onSave(null); return }
    setSaving(true)
    try {
      if (selected.type === 'preset') {
        await updateMyProfile({ profile_picture: selected.url })
      }
      // 'upload' type already saved via uploadProfilePicture
    } catch { /* non-fatal */ }
    setSaving(false)
    onSave(selected.url)
  }

  return (
    <div className="space-y-4">
      {/* Preset grid */}
      <div className="grid grid-cols-4 gap-2">
        {PRESET_AVATARS.map(av => (
          <button
            key={av.id}
            type="button"
            onClick={() => handlePreset(av)}
            className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
              selected?.id === av.id ? 'border-primary scale-105' : 'border-transparent hover:border-primary/30'
            }`}
          >
            <img src={av.url} alt={av.id} className="w-full h-full object-cover" />
            {selected?.id === av.id && (
              <div className="absolute inset-0 bg-primary/10 flex items-end justify-end p-0.5">
                <span className="material-symbols-outlined text-primary bg-white rounded-full text-xs leading-none p-0.5"
                  style={{ fontVariationSettings: "'FILL' 1", fontSize: 14 }}>check_circle</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Upload button */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-outline-variant text-sm text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
      >
        {uploading
          ? <><div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" /> Uploading…</>
          : <><span className="material-symbols-outlined text-base">upload</span> Upload your own photo</>
        }
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {selected?.type === 'upload' && (
        <div className="flex items-center gap-2 text-xs text-primary">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          Photo uploaded!
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full btn-primary py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {saving
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
          : selected ? 'Save & Continue' : 'Skip for now →'
        }
      </button>
    </div>
  )
}

// ── Goal step ─────────────────────────────────────────────────────────────────
function GoalStep({ onSave }) {
  const [goal,      setGoal]      = useState(12)
  const [useCustom, setUseCustom] = useState(false)
  const [custom,    setCustom]    = useState('')
  const [saving,    setSaving]    = useState(false)

  const handleSave = async () => {
    const finalGoal = useCustom ? parseInt(custom, 10) : goal
    if (finalGoal > 0) {
      setSaving(true)
      try { await updateMyProfile({ yearly_goal: finalGoal }) } catch { /* non-fatal */ }
      setSaving(false)
    }
    onSave(finalGoal || null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GOAL_PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => { setGoal(p); setUseCustom(false) }}
            className={`flex flex-col items-center px-4 py-2.5 rounded-2xl border-2 transition-all ${
              !useCustom && goal === p
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant bg-surface-container-low text-on-surface hover:border-primary/50'
            }`}
          >
            <span className="text-xl font-bold">{p}</span>
            <span className={`text-xs ${!useCustom && goal === p ? 'text-on-primary/70' : 'text-on-surface-variant'}`}>books</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setUseCustom(true)}
          className={`flex flex-col items-center px-4 py-2.5 rounded-2xl border-2 transition-all ${
            useCustom ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary/50'
          }`}
        >
          <span className="text-xl font-bold">#</span>
          <span className="text-xs">custom</span>
        </button>
      </div>

      {useCustom && (
        <input
          autoFocus
          type="number"
          min="1"
          max="999"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="e.g. 20"
          className="w-full bg-surface-container-low rounded-xl px-4 py-2.5 text-lg font-bold text-center border-2 border-primary focus:outline-none"
        />
      )}

      {!useCustom && (
        <p className="text-xs text-on-surface-variant">
          ≈ <span className="font-semibold text-primary">{(goal / 12).toFixed(1)} books / month</span>
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full btn-primary py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {saving
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
          : 'Save & Continue'
        }
      </button>
    </div>
  )
}

// ── Add Book step ─────────────────────────────────────────────────────────────
function AddBookStep({ onSave }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [added,   setAdded]   = useState(null)
  const [adding,  setAdding]  = useState(null)
  const debounceRef           = useRef()

  const search = async (q) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const data = await searchGoogleBooks(q)
      setResults((data?.items || []).slice(0, 5))
    } catch { setResults([]) }
    setLoading(false)
  }

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 400)
  }

  const handleAdd = async (book) => {
    setAdding(book.id)
    try {
      await addToLibrary({
        google_books_id: book.id,
        title:  book.volumeInfo?.title,
        author: book.volumeInfo?.authors?.join(', '),
        cover_url: book.volumeInfo?.imageLinks?.thumbnail,
        total_pages: book.volumeInfo?.pageCount || null,
        status: 'reading',
      })
      setAdded(book)
      setResults([])
    } catch { /* non-fatal */ }
    setAdding(null)
  }

  if (added) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-surface-container-low rounded-2xl p-3">
          {added.volumeInfo?.imageLinks?.thumbnail && (
            <img src={added.volumeInfo.imageLinks.thumbnail} alt="" className="w-10 h-14 object-cover rounded-lg shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-on-surface truncate">{added.volumeInfo?.title}</p>
            <p className="text-xs text-on-surface-variant truncate">{added.volumeInfo?.authors?.join(', ')}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-primary font-medium">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Added to your library!
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSave(added)}
          className="w-full btn-primary py-2.5 rounded-xl text-sm font-bold"
        >
          Continue →
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-lg">search</span>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search by title or author…"
          className="w-full bg-surface-container-low rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-1 max-h-52 overflow-y-auto rounded-xl border border-outline-variant/20">
          {results.map(book => (
            <button
              key={book.id}
              type="button"
              onClick={() => handleAdd(book)}
              disabled={adding === book.id}
              className="w-full flex items-center gap-3 p-2.5 hover:bg-surface-container-low transition-colors text-left border-b border-outline-variant/10 last:border-0"
            >
              {book.volumeInfo?.imageLinks?.thumbnail
                ? <img src={book.volumeInfo.imageLinks.thumbnail} alt="" className="w-8 h-11 object-cover rounded shrink-0" />
                : <div className="w-8 h-11 bg-surface-container-high rounded shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-outline text-sm">menu_book</span>
                  </div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface truncate leading-snug">{book.volumeInfo?.title}</p>
                <p className="text-xs text-on-surface-variant truncate">{book.volumeInfo?.authors?.[0]}</p>
              </div>
              <div className="shrink-0 bg-primary text-on-primary text-xs font-bold px-3 py-1 rounded-full">
                {adding === book.id ? '…' : 'Add'}
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onSave(null)}
        className="w-full text-center text-sm text-on-surface-variant hover:text-on-surface transition-colors py-1"
      >
        Skip for now →
      </button>
    </div>
  )
}

// ── Done step ─────────────────────────────────────────────────────────────────
function DoneStep({ avatarUrl, goal, bookAdded }) {
  return (
    <div className="text-center space-y-4">
      <span className="text-5xl block">🌟</span>
      <h3 className="font-serif text-xl font-bold text-on-surface">You're all set!</h3>
      <div className="space-y-2 text-sm text-left">
        <div className={`flex items-center gap-2 ${avatarUrl ? 'text-primary' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-base" style={avatarUrl ? { fontVariationSettings: "'FILL' 1" } : {}}>
            {avatarUrl ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          Profile photo set
        </div>
        <div className={`flex items-center gap-2 ${goal ? 'text-primary' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-base" style={goal ? { fontVariationSettings: "'FILL' 1" } : {}}>
            {goal ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          Reading goal: {goal ? `${goal} books/year` : 'not set'}
        </div>
        <div className={`flex items-center gap-2 ${bookAdded ? 'text-primary' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-base" style={bookAdded ? { fontVariationSettings: "'FILL' 1" } : {}}>
            {bookAdded ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          First book added
        </div>
      </div>
      <p className="text-sm text-on-surface-variant leading-relaxed pt-1">
        Head to your Library to keep logging, or explore the Feed to see what friends are reading.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AppTour({ onDone }) {
  const [step,      setStep]      = useState(0)
  const [rect,      setRect]      = useState(null)
  const [visible,   setVisible]   = useState(false)
  const [animating, setAnimating] = useState(false)

  // Setup state — passed to Done step
  const [savedAvatar, setSavedAvatar] = useState(null)
  const [savedGoal,   setSavedGoal]   = useState(null)
  const [savedBook,   setSavedBook]   = useState(null)

  const current = STEPS[step]
  const total   = STEPS.length

  // Measure nav target for spotlight steps
  useLayoutEffect(() => {
    if (current.type !== 'nav') { setRect({}); return }  // non-null sentinel
    const measure = () => setRect(getRect(current.target))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step, current])

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const finish = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      localStorage.setItem(ONBOARDING_KEY, '1')
      onDone?.()
    }, 200)
  }, [onDone])

  const goTo = (next) => {
    if (animating) return
    setAnimating(true)
    setRect(null)
    setTimeout(() => {
      setStep(next)
      setAnimating(false)
    }, 150)
  }

  const next = () => step < total - 1 ? goTo(step + 1) : finish()
  const back = () => step > 0 && goTo(step - 1)

  // ── Spotlight geometry (nav steps) ────────────────────────────────────────
  let sl, st, sw, sh
  if (rect && rect.top !== undefined) {
    sl = rect.left - PAD
    st = rect.top  - PAD
    sw = rect.width  + PAD * 2
    sh = rect.height + PAD * 2
  }

  // ── Tooltip position (nav steps) ─────────────────────────────────────────
  const TOOLTIP_W = 280
  const GAP = 12
  let tooltipTop, tooltipLeft, arrowLeft

  if (sl !== undefined) {
    if (current.placement === 'bottom' || current.placement === 'bottom-end') {
      tooltipTop  = st + sh + PAD + GAP
      tooltipLeft = current.placement === 'bottom-end'
        ? Math.min(sl + sw - TOOLTIP_W, window.innerWidth - TOOLTIP_W - 16)
        : Math.max(16, sl + sw / 2 - TOOLTIP_W / 2)
    }
    tooltipLeft = Math.min(tooltipLeft, window.innerWidth - TOOLTIP_W - 16)
    arrowLeft = current.placement === 'bottom-end'
      ? TOOLTIP_W - 32
      : Math.max(16, sl + sw / 2 - tooltipLeft - 8)
  }

  const isLast = step === total - 1
  const isSetup = current.type === 'setup' || current.type === 'done'

  // Wait for rect on nav steps
  if (current.type === 'nav' && !rect) return null

  return (
    <div
      className="fixed inset-0 z-[9990]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.2s ease' }}
    >
      {/* ── Dark overlay ──────────────────────────────────────────────────── */}
      {sl !== undefined ? (
        <>
          <div className="absolute bg-black/65" style={{ top: 0, left: 0, right: 0, height: st }} />
          <div className="absolute bg-black/65" style={{ top: st + sh, left: 0, right: 0, bottom: 0 }} />
          <div className="absolute bg-black/65" style={{ top: st, left: 0, width: sl, height: sh }} />
          <div className="absolute bg-black/65" style={{ top: st, left: sl + sw, right: 0, height: sh }} />
          {/* Spotlight ring */}
          <div className="absolute pointer-events-none" style={{
            top: st, left: sl, width: sw, height: sh, borderRadius: 10,
            boxShadow: '0 0 0 2px #00464a, 0 0 0 5px rgba(0,70,74,0.25)',
          }} />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/65" />
      )}

      {/* ── Progress dots ─────────────────────────────────────────────────── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-[9999]">
        {STEPS.map((_, i) => (
          <div key={i} className="h-1.5 rounded-full transition-all duration-300" style={{
            width: i === step ? 24 : 6,
            backgroundColor: i === step ? '#fff' : i < step ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
          }} />
        ))}
      </div>

      {/* ── Skip ──────────────────────────────────────────────────────────── */}
      <button
        onClick={finish}
        className="absolute top-3.5 right-5 text-sm text-white/60 hover:text-white transition-colors z-[9999]"
      >
        Skip tour
      </button>

      {/* ══ NAV spotlight tooltip ════════════════════════════════════════════ */}
      {current.type === 'nav' && tooltipTop !== undefined && (
        <div style={{ position: 'fixed', top: tooltipTop, left: tooltipLeft, width: TOOLTIP_W, zIndex: 9999, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))' }}>
          {/* Arrow up */}
          <div style={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '8px solid white', marginLeft: arrowLeft, marginBottom: -1 }} />
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-sm text-on-surface">{current.title}</p>
              <span className="text-xs text-on-surface-variant whitespace-nowrap mt-0.5">{step + 1}/{total}</span>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">{current.body}</p>
            <div className="flex items-center justify-between">
              {step > 0
                ? <button onClick={back} className="text-xs text-on-surface-variant hover:text-on-surface">← Back</button>
                : <span />}
              <button onClick={next} className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-primary">Next →</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SETUP / DONE centered card ══════════════════════════════════════ */}
      {isSetup && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-[9999]">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-float p-6 space-y-4" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-serif text-lg font-bold text-on-surface leading-snug">
                  {current.title}
                </h3>
                {current.body && <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">{current.body}</p>}
              </div>
              <span className="text-xs text-on-surface-variant whitespace-nowrap mt-1">{step + 1}/{total}</span>
            </div>

            {/* Setup content */}
            {current.id === 'avatar' && (
              <AvatarStep onSave={(url) => { setSavedAvatar(url); next() }} />
            )}
            {current.id === 'goal' && (
              <GoalStep onSave={(g) => { setSavedGoal(g); next() }} />
            )}
            {current.id === 'book' && (
              <AddBookStep onSave={(b) => { setSavedBook(b); next() }} />
            )}
            {current.type === 'done' && (
              <>
                <DoneStep avatarUrl={savedAvatar} goal={savedGoal} bookAdded={savedBook} />
                <button onClick={finish} className="w-full btn-primary py-3 rounded-2xl text-sm font-bold">
                  Start Reading 🚀
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
