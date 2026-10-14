import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n'

// The language control for SIGNED-OUT visitors.
//
// i18n/index.js detects with `order: ['localStorage', 'navigator']`, so a first-time visitor
// gets whatever their browser reports. Until this existed, the only switcher in the whole web
// app lived in SettingsPage, which sits behind PrivateRoute - so a visitor auto-detected into a
// language they cannot read had to sign in, in that language, to find the control. That is the
// bug this fixes, and it is why the component belongs on the public side of the auth boundary.
//
// It is deliberately NOT added to /privacy, /support, /terms or /about: those pages carry no
// t() calls at all, so a picker there would change the chrome and leave the page in English.
// LoginPage is the only public page that is actually translated.
export default function LanguagePicker() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on an outside click or Escape, so the menu cannot be left hanging over the page.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // i18n.language can be a region tag ("en-GB"); the menu keys are bare codes.
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === (i18n.language || '').split('-')[0])

  const pick = async (code) => {
    await changeLanguage(code)          // also writes tmr_language, so the choice survives a reload
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined text-lg leading-none">language</span>
        <span className="font-medium">{current ? current.label : 'English'}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 min-w-[11rem] bg-surface-container-lowest rounded-2xl shadow-float border border-outline-variant/15 overflow-hidden z-50"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                type="button"
                role="option"
                aria-selected={current?.code === lang.code}
                onClick={() => pick(lang.code)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-surface-container
                  ${current?.code === lang.code ? 'text-primary font-semibold' : 'text-on-surface'}`}
              >
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
