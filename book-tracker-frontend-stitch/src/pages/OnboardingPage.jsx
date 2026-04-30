import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateMyProfile, importGoodreads, cacheClear } from '../services/api'
import { useToast } from '../components/Toast'

// ── Bump this key to re-show onboarding for ALL users ────────────────────────
export const ONBOARDING_KEY = 'bt_onboarding_v1'

const STEPS = ['welcome', 'tour', 'goal', 'import', 'done']

const TABS = [
  {
    icon: 'newspaper_variant',
    iconFallback: 'article',
    label: 'Feed',
    headline: 'Stay Connected',
    desc: "See what your friends are reading, their highlights and reading milestones — all in one place.",
    color: '#00464a',
    bg: '#e8f5f5',
  },
  {
    icon: 'menu_book',
    label: 'Library',
    headline: 'Your Shelf',
    desc: "Track every book — currently reading, want to read, and finished. Log page progress anytime.",
    color: '#735c00',
    bg: '#fff8e1',
  },
  {
    icon: 'groups',
    label: 'Circles',
    headline: 'Read Together',
    desc: "Join reading circles, compete on leaderboards, and discuss books with groups of friends.",
    color: '#62330f',
    bg: '#fef3ec',
  },
  {
    icon: 'insights',
    label: 'Insights',
    headline: 'Know Yourself',
    desc: "Visualise your reading habit — streaks, pages per day, and yearly goal progress.",
    color: '#2e4d7b',
    bg: '#eef2fb',
  },
]

const GOAL_PRESETS = [6, 12, 24, 36, 52]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep]             = useState(0)
  const [leaving, setLeaving]       = useState(false)

  // Goal step
  const [goal, setGoal]             = useState(12)
  const [customGoal, setCustomGoal] = useState('')
  const [useCustom, setUseCustom]   = useState(false)
  const [savingGoal, setSavingGoal] = useState(false)

  // Import step
  const csvInputRef                 = useRef()
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError]   = useState(null)
  const [dragging, setDragging]     = useState(false)

  const total = STEPS.length

  const animateNext = (nextStep) => {
    setLeaving(true)
    setTimeout(() => {
      setStep(nextStep)
      setLeaving(false)
    }, 180)
  }

  const handleNext = async () => {
    // Save goal before advancing
    if (step === 2) {
      const finalGoal = useCustom ? parseInt(customGoal, 10) : goal
      if (finalGoal > 0) {
        setSavingGoal(true)
        try { await updateMyProfile({ yearly_goal: finalGoal }) } catch { /* non-fatal */ }
        setSavingGoal(false)
      }
    }

    if (step < total - 1) {
      animateNext(step + 1)
    } else {
      finish()
    }
  }

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    navigate('/home', { replace: true })
  }

  // ── Import handlers ──────────────────────────────────────────────────────
  const handleCsvSelect = (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError('Please select the .csv file exported from Goodreads.')
      return
    }
    setImportFile(file)
    setImportResult(null)
    setImportError(null)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleCsvSelect(e.dataTransfer.files?.[0])
  }, [])

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    setImportError(null)
    try {
      const result = await importGoodreads(importFile)
      setImportResult(result)
      setImportFile(null)
      if (result.imported > 0) toast(`${result.imported} books imported!`, 'success')
    } catch (e) {
      setImportError(e.message || 'Import failed. Please try again.')
    }
    setImporting(false)
  }

  const isBusy = savingGoal || importing

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-primary' : i < step ? 'w-2 bg-primary/40' : 'w-2 bg-outline-variant'
              }`}
            />
          ))}
        </div>

        {/* Skip — hidden on last step */}
        {step < total - 1 && (
          <button
            onClick={finish}
            className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Skip
          </button>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div
        className={`flex-1 overflow-y-auto transition-all duration-180 ${leaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}
        style={{ transitionProperty: 'opacity, transform' }}
      >
        <div className="max-w-2xl mx-auto px-6 py-10">
          {step === 0 && <WelcomeStep />}
          {step === 1 && <TourStep />}
          {step === 2 && (
            <GoalStep
              goal={goal} setGoal={setGoal}
              customGoal={customGoal} setCustomGoal={setCustomGoal}
              useCustom={useCustom} setUseCustom={setUseCustom}
            />
          )}
          {step === 3 && (
            <ImportStep
              csvInputRef={csvInputRef}
              importFile={importFile}
              importResult={importResult}
              importError={importError}
              importing={importing}
              dragging={dragging}
              setDragging={setDragging}
              onDrop={handleDrop}
              onSelect={handleCsvSelect}
              onImport={handleImport}
              onReset={() => { setImportResult(null); setImportFile(null); setImportError(null) }}
            />
          )}
          {step === 4 && <DoneStep imported={importResult?.imported ?? 0} />}
        </div>
      </div>

      {/* ── Footer CTA ────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-5 border-t border-outline-variant/15 bg-surface">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button
            onClick={handleNext}
            disabled={isBusy}
            className="flex-1 btn-primary py-3.5 text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isBusy ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {savingGoal ? 'Saving goal…' : 'Importing…'}
              </>
            ) : step === total - 1 ? (
              'Start Reading'
            ) : (
              'Continue'
            )}
          </button>
          {/* Skip this step — only for goal + import steps */}
          {(step === 2 || step === 3) && !isBusy && (
            <button
              onClick={() => animateNext(step + 1)}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors whitespace-nowrap"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step: Welcome ─────────────────────────────────────────────────────────────
function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center pt-6">
      <span className="text-7xl mb-6">📖</span>
      <h1 className="font-serif text-4xl font-bold text-primary mb-4 leading-tight">
        Welcome to TrackMyRead
      </h1>
      <p className="text-base text-on-surface-variant leading-relaxed max-w-md mb-8">
        Your social home for books. Track every read, share your journey, and discover what your friends are loving.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {['📚 Track every book', '✍️ Share highlights', '👥 Connect with readers', '🎯 Hit your reading goal'].map(p => (
          <span key={p} className="px-4 py-2 bg-surface-container-low rounded-full text-sm font-medium text-on-surface border border-outline-variant/30">
            {p}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Step: App Tour ────────────────────────────────────────────────────────────
function TourStep() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="font-serif text-3xl font-bold text-primary mb-2">What's inside</h2>
        <p className="text-on-surface-variant">Four powerful tools, one beautiful app.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TABS.map(tab => (
          <div
            key={tab.label}
            className="rounded-2xl p-5 space-y-3"
            style={{ backgroundColor: tab.bg }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: tab.color + '18' }}
              >
                <span
                  className="material-symbols-outlined text-xl"
                  style={{ color: tab.color, fontVariationSettings: "'FILL' 0" }}
                >
                  {tab.icon}
                </span>
              </div>
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: tab.color }}
              >
                {tab.label}
              </span>
            </div>
            <h3 className="font-serif text-lg font-bold text-on-surface">{tab.headline}</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">{tab.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step: Reading Goal ────────────────────────────────────────────────────────
function GoalStep({ goal, setGoal, customGoal, setCustomGoal, useCustom, setUseCustom }) {
  return (
    <div>
      <div className="mb-8">
        <span className="text-5xl block mb-4">🎯</span>
        <h2 className="font-serif text-3xl font-bold text-primary mb-2">Set a Reading Goal</h2>
        <p className="text-on-surface-variant">
          How many books do you want to finish this year? You can always change this in Settings.
        </p>
      </div>

      {/* Preset chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        {GOAL_PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => { setGoal(p); setUseCustom(false) }}
            className={`flex flex-col items-center px-5 py-3 rounded-2xl border-2 transition-all ${
              !useCustom && goal === p
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant bg-surface-container-low text-on-surface hover:border-primary/50'
            }`}
          >
            <span className="text-2xl font-bold">{p}</span>
            <span className={`text-xs mt-0.5 ${!useCustom && goal === p ? 'text-on-primary/75' : 'text-on-surface-variant'}`}>
              books
            </span>
          </button>
        ))}

        {/* Custom */}
        <button
          type="button"
          onClick={() => setUseCustom(true)}
          className={`flex flex-col items-center px-5 py-3 rounded-2xl border-2 transition-all ${
            useCustom
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary/50'
          }`}
        >
          <span className="text-2xl font-bold">#</span>
          <span className="text-xs mt-0.5">Custom</span>
        </button>
      </div>

      {useCustom && (
        <div className="flex items-center gap-3 mb-4">
          <input
            type="number"
            autoFocus
            min="1"
            max="999"
            value={customGoal}
            onChange={e => setCustomGoal(e.target.value)}
            placeholder="e.g. 20"
            className="w-28 bg-surface-container-low rounded-xl px-4 py-3 text-2xl font-bold text-on-surface border-2 border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-center"
          />
          <span className="text-on-surface-variant text-sm">books per year</span>
        </div>
      )}

      {!useCustom && goal > 0 && (
        <p className="text-sm text-on-surface-variant">
          That's about{' '}
          <span className="font-semibold text-primary">{(goal / 12).toFixed(1)} books per month</span>
          {' '}— {goal <= 12 ? 'a relaxed, sustainable pace.' : goal <= 24 ? 'a great reading habit.' : 'an impressive reading goal!'}
        </p>
      )}
    </div>
  )
}

// ── Step: Import from Goodreads ───────────────────────────────────────────────
function ImportStep({ csvInputRef, importFile, importResult, importError, importing, dragging, setDragging, onDrop, onSelect, onImport, onReset }) {
  if (importResult) {
    return (
      <div className="text-center py-6">
        <span className="text-6xl block mb-4">{importResult.imported > 0 ? '🎉' : '📋'}</span>
        <h2 className="font-serif text-3xl font-bold text-primary mb-2">Import Complete</h2>
        <div className="grid grid-cols-3 gap-3 my-6">
          <div className="bg-surface-container-low rounded-2xl p-4">
            <p className="text-3xl font-bold text-primary">{importResult.imported}</p>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Imported</p>
          </div>
          <div className="bg-surface-container-low rounded-2xl p-4">
            <p className="text-3xl font-bold text-on-surface-variant">{importResult.skipped}</p>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Already in library</p>
          </div>
          <div className="bg-surface-container-low rounded-2xl p-4">
            <p className={`text-3xl font-bold ${importResult.failed > 0 ? 'text-error' : 'text-on-surface-variant'}`}>{importResult.failed}</p>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Errors</p>
          </div>
        </div>
        {importResult.imported > 0 && (
          <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
            Your Goodreads library is now in TrackMyRead. Ratings and reviews have been saved too.
          </p>
        )}
        <button onClick={onReset} className="text-sm text-on-surface-variant hover:text-primary transition-colors">
          Import another file
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <span className="text-5xl block mb-4">📦</span>
        <h2 className="font-serif text-3xl font-bold text-primary mb-2">Import from Goodreads</h2>
        <p className="text-on-surface-variant leading-relaxed">
          Bring your entire Goodreads library across — books, reading status, star ratings, and reviews.
          You can also do this later in Settings.
        </p>
      </div>

      {/* How-to steps */}
      <div className="bg-surface-container-low rounded-2xl p-5 mb-5 space-y-3">
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">How to export from Goodreads</p>
        {[
          { n: '1', text: 'Open the Goodreads Import & Export page', link: 'https://www.goodreads.com/review/import' },
          { n: '2', text: 'Scroll to "Export Library" and click the button' },
          { n: '3', text: 'Download the .csv file Goodreads generates' },
          { n: '4', text: 'Drop it in the upload zone below' },
        ].map(s => (
          <div key={s.n} className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {s.n}
            </span>
            <p className="text-sm text-on-surface leading-relaxed flex-1">
              {s.text}
              {s.link && (
                <a
                  href={s.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary font-medium hover:underline ml-2"
                >
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                  Go there →
                </a>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !importFile && csvInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
          dragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : importFile
            ? 'border-secondary/50 bg-secondary/5 cursor-default'
            : 'border-outline-variant hover:border-primary/50 hover:bg-surface-container-low'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
          {importFile ? (
            <>
              <span className="material-symbols-outlined text-4xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
              <p className="font-semibold text-sm text-on-surface">{importFile.name}</p>
              <p className="text-xs text-on-surface-variant">{(importFile.size / 1024).toFixed(1)} KB</p>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onSelect(null) }}
                className="text-xs text-on-surface-variant hover:text-error transition-colors mt-1"
              >
                Remove file
              </button>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-4xl text-outline-variant">upload_file</span>
              <p className="font-semibold text-sm text-on-surface">Drop your Goodreads CSV here</p>
              <p className="text-xs text-on-surface-variant">or click to browse · .csv files only</p>
            </>
          )}
        </div>
      </div>
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => onSelect(e.target.files?.[0])} />

      {importError && (
        <div className="flex items-start gap-2 mt-3 text-sm text-error bg-error/8 rounded-xl px-4 py-3">
          <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
          {importError}
        </div>
      )}

      {importFile && !importing && (
        <button
          type="button"
          onClick={onImport}
          className="w-full mt-4 btn-primary py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">upload</span>
          Import from Goodreads
        </button>
      )}
      {importing && (
        <p className="text-xs text-center text-on-surface-variant mt-3">
          Importing your library… please don't close this tab.
        </p>
      )}
    </div>
  )
}

// ── Step: Done ────────────────────────────────────────────────────────────────
function DoneStep({ imported }) {
  return (
    <div className="flex flex-col items-center text-center pt-6">
      <span className="text-7xl mb-6">🌟</span>
      <h2 className="font-serif text-4xl font-bold text-primary mb-4">You're all set!</h2>
      <p className="text-base text-on-surface-variant leading-relaxed max-w-md mb-8">
        {imported > 0
          ? `${imported} books from Goodreads are now in your library. Your reading journey continues here.`
          : 'Your reading journey begins now. Explore the app, add books, follow friends, and start logging your reading.'
        }
      </p>
      <div className="w-full max-w-sm space-y-3 text-left">
        {[
          { icon: 'menu_book', text: 'Browse your Library' },
          { icon: 'article', text: 'Check the Feed' },
          { icon: 'groups', text: 'Join a Reading Circle' },
          { icon: 'insights', text: 'View your Insights' },
        ].map(item => (
          <div key={item.text} className="flex items-center gap-3 bg-surface-container-low rounded-xl px-4 py-3 border border-outline-variant/30">
            <span className="material-symbols-outlined text-primary">{item.icon}</span>
            <span className="text-sm font-medium text-on-surface">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
