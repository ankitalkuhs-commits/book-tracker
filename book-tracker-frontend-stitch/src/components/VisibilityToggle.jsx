import { useTranslation } from 'react-i18next'
import { writeNoteVisibility } from '../utils/noteVisibility'

// Only me first, Public second (F-17).
const OPTIONS = [
  { value: 'private', icon: 'lock',   labelKey: 'feed.visibilityPrivate' },
  { value: 'public',  icon: 'public', labelKey: 'feed.visibilityPublic' },
]

export default function VisibilityToggle({ value, onChange }) {
  const { t } = useTranslation()

  const handleSelect = (next) => {
    writeNoteVisibility(next)   // write on change, not on mount
    onChange(next)
  }

  return (
    <div role="radiogroup" aria-label={t('feed.visibilityLabel')} className="inline-flex bg-surface-container-low rounded-full p-1 gap-1">
      {OPTIONS.map(opt => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => handleSelect(opt.value)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              selected ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{opt.icon}</span>
            {t(opt.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
