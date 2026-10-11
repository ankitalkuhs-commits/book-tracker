import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from './Toast'
import { blockUser } from '../services/api'

// Sprint 4I — one Block affordance, so the confirm copy is written once.
//
// The copy is load-bearing, not decoration. A block is irreversible in one respect and powerless in
// another, and a reader must know both BEFORE the tap:
//   * `safety.blockConfirm` says the follow in either direction is removed and does not come back
//     when they unblock (R-21), because discovering that afterwards is not recoverable; and
//   * it says the block does not unpublish public posts — /notes/feed serves signed-out callers and
//     cannot filter by a block that has no viewer (pm-decisions E-8). Saying nothing here would let
//     a reader believe they are hidden from the web when they are not.
export default function BlockButton({ userId, name, variant = 'menu-item', onBlocked, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [working, setWorking] = useState(false)

  const handleBlock = async () => {
    if (working) return
    if (!window.confirm(t('safety.blockConfirm', { name: name || t('safety.thisReader') }))) { onDone?.(); return }
    setWorking(true)
    try {
      await blockUser(userId)
      toast(t('safety.blocked', { name: name || t('safety.thisReader') }), 'success')
      onBlocked?.(userId)
    } catch (e) {
      toast(e.message || t('safety.blockFailed'), 'error')
    }
    setWorking(false)
    onDone?.()
  }

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        onClick={handleBlock}
        disabled={working}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-sm">block</span>
        {t('safety.block')}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleBlock}
      disabled={working}
      title={t('safety.block')}
      aria-label={t('safety.block')}
      className="text-on-surface-variant/30 hover:text-error transition-colors disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-base">block</span>
    </button>
  )
}
