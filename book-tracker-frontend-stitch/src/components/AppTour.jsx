import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { ONBOARDING_KEY } from '../pages/OnboardingPage'

const STEPS = [
  {
    target: '[data-tour="home"]',
    title: 'Your Reading Feed',
    body: 'See what your friends are reading, their highlights, and milestones — all in real time.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="library"]',
    title: 'Your Shelf',
    body: 'Track every book — currently reading, want to read, and finished. Log page progress anytime.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="groups"]',
    title: 'Reading Circles',
    body: 'Join circles, compete on leaderboards, and discuss books together with friends.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="insights"]',
    title: 'Track Your Progress',
    body: 'Visualise your reading habit — streaks, pages per day, and yearly goal progress.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="avatar"]',
    title: 'Profile & Settings',
    body: 'Set your reading goal, import your Goodreads library, and customise your profile — all from here.',
    placement: 'bottom-end',
  },
]

const PAD = 8   // spotlight padding around the target

function getRect(selector) {
  const el = document.querySelector(selector)
  if (!el) return null
  return el.getBoundingClientRect()
}

export default function AppTour({ onDone }) {
  const [step, setStep]         = useState(0)
  const [rect, setRect]         = useState(null)
  const [visible, setVisible]   = useState(false)

  const current = STEPS[step]

  // Measure target element whenever step changes
  useLayoutEffect(() => {
    const measure = () => {
      const r = getRect(current.target)
      setRect(r)
    }
    measure()
    // Re-measure on resize
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step, current.target])

  // Fade in on mount
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

  const next = () => {
    if (step < STEPS.length - 1) {
      setRect(null)   // clear so spotlight doesn't snap before measure
      setStep(s => s + 1)
    } else {
      finish()
    }
  }

  if (!rect) return null

  // ── Spotlight geometry ───────────────────────────────────────────────────
  const sl = rect.left   - PAD
  const st = rect.top    - PAD
  const sw = rect.width  + PAD * 2
  const sh = rect.height + PAD * 2

  // ── Tooltip positioning ──────────────────────────────────────────────────
  const TOOLTIP_W = 280
  const ARROW_H   = 8
  const GAP       = 12

  let tooltipTop, tooltipLeft, arrowDir

  if (current.placement === 'bottom' || current.placement === 'bottom-end') {
    tooltipTop  = st + sh + PAD + GAP
    arrowDir    = 'top'
    if (current.placement === 'bottom-end') {
      // anchor tooltip right edge to spotlight right edge
      tooltipLeft = Math.min(sl + sw - TOOLTIP_W, window.innerWidth - TOOLTIP_W - 16)
    } else {
      // center tooltip under spotlight
      tooltipLeft = Math.max(16, sl + sw / 2 - TOOLTIP_W / 2)
    }
  } else {
    // fallback: above
    tooltipTop  = st - sh - GAP - 120  // rough estimate
    arrowDir    = 'bottom'
    tooltipLeft = Math.max(16, sl + sw / 2 - TOOLTIP_W / 2)
  }
  tooltipLeft = Math.min(tooltipLeft, window.innerWidth - TOOLTIP_W - 16)

  const isLast = step === STEPS.length - 1

  return (
    <div
      className="fixed inset-0 z-[9990]"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      {/* ── Dark overlay — 4 rects around the spotlight ─────────────────── */}
      {/* Top */}
      <div className="absolute bg-black/60" style={{ top: 0, left: 0, right: 0, height: st }} />
      {/* Bottom */}
      <div className="absolute bg-black/60" style={{ top: st + sh, left: 0, right: 0, bottom: 0 }} />
      {/* Left */}
      <div className="absolute bg-black/60" style={{ top: st, left: 0, width: sl, height: sh }} />
      {/* Right */}
      <div className="absolute bg-black/60" style={{ top: st, left: sl + sw, right: 0, height: sh }} />

      {/* ── Spotlight border ring ─────────────────────────────────────────── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: st, left: sl, width: sw, height: sh,
          borderRadius: 10,
          boxShadow: '0 0 0 2px #00464a, 0 0 0 4px rgba(0,70,74,0.3)',
          transition: 'all 0.25s ease',
        }}
      />

      {/* ── Skip button ──────────────────────────────────────────────────── */}
      <button
        onClick={finish}
        className="absolute top-4 right-6 text-white/60 hover:text-white text-sm transition-colors"
        style={{ zIndex: 9999 }}
      >
        Skip tour
      </button>

      {/* ── Step counter ─────────────────────────────────────────────────── */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5"
        style={{ zIndex: 9999 }}
      >
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === step ? 24 : 6,
              backgroundColor: i === step ? '#ffffff' : 'rgba(255,255,255,0.3)',
            }}
          />
        ))}
      </div>

      {/* ── Tooltip card ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          top: tooltipTop,
          left: tooltipLeft,
          width: TOOLTIP_W,
          zIndex: 9999,
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.25))',
        }}
      >
        {/* Arrow */}
        {arrowDir === 'top' && (
          <div style={{
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderBottom: '8px solid white',
            marginLeft: current.placement === 'bottom-end'
              ? TOOLTIP_W - 32
              : Math.max(16, sl + sw / 2 - tooltipLeft - 8),
            marginBottom: -1,
          }} />
        )}

        <div className="bg-white rounded-2xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-sm text-on-surface leading-snug">{current.title}</p>
            <span className="text-xs text-on-surface-variant whitespace-nowrap mt-0.5">{step + 1} / {STEPS.length}</span>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed">{current.body}</p>

          <div className="flex items-center justify-between pt-1">
            {step > 0 ? (
              <button
                onClick={() => { setRect(null); setStep(s => s - 1) }}
                className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
              >
                ← Back
              </button>
            ) : <span />}

            <button
              onClick={next}
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all"
              style={{ backgroundColor: '#00464a' }}
            >
              {isLast ? 'Done' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
