import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useToast } from './Toast'
import { reportContent } from '../services/api'

// Sprint 4I — one Report affordance, used at every surface that shows someone else's content
// (spec R-05). It is one component rather than six copies of a modal so the reason picker, the
// "Also block this person" default and the copy about what a block does cannot drift apart
// between surfaces.
//
// The reasons are the API's closed set, byte for byte: `REASONS` in app/routers/reports_router.py.
// A reason this list carries and the server does not is a 422 the reader cannot act on, so
// qa/unit/reportAffordance.test.mjs reads the Python tuple at test time and compares it to this
// array rather than to a re-typed copy.
export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'other']

function ReportDialog({ targetType, targetId, targetName, onClose, onReported }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  // Checked by default ONLY when the thing reported IS a person. This supersedes pm-decisions
  // E-3, which started it checked everywhere. E-3's reasoning holds for an account report —
  // relief by the reader's own hand, because the queue is reviewed within two working days and
  // that is not "now". It does not hold for a note or a comment: "spam", "hate" and "violence"
  // judge a piece of CONTENT, while a block deletes the follow both ways and unblocking restores
  // none of it (blocks_router.py, R-21). A `useState` initial value is right here and wrong in
  // the mobile sheet because THIS dialog is mounted per open (`{open && <ReportDialog …>}`) with
  // `targetType` fixed for the life of the mount.
  const [alsoBlock, setAlsoBlock] = useState(targetType === 'user')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!reason || submitting) return
    setSubmitting(true)
    try {
      // ONE request. `also_block` is a field, not a second call: the server writes the report and
      // the block in one transaction (pm-decisions Q-3), so the reader is never told "report
      // received" while the block silently did not happen.
      await reportContent({
        target_type: targetType,
        target_id: targetId,
        reason,
        detail: detail.trim(),
        also_block: alsoBlock,
      })
      toast(alsoBlock ? t('safety.reportedAndBlocked') : t('safety.reported'), 'success')
      onReported?.({ blocked: alsoBlock })
      onClose()
    } catch (err) {
      toast(err.message || t('safety.reportFailed'), 'error')
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-scrim/50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        className="bg-surface-container-lowest rounded-3xl p-6 w-full max-w-md space-y-4 shadow-float max-h-[90vh] overflow-y-auto"
      >
        <div className="space-y-1">
          <h2 className="font-serif text-xl font-bold text-on-surface">{t('safety.reportTitle')}</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {targetName ? t('safety.reportSubtitleNamed', { name: targetName }) : t('safety.reportSubtitle')}
          </p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
            {t('safety.reasonLabel')}
          </legend>
          {REPORT_REASONS.map(r => (
            <label
              key={r}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-colors ${
                reason === r ? 'bg-primary/10 text-primary' : 'hover:bg-surface-container text-on-surface'
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-primary"
              />
              <span className="text-sm font-medium">{t(`safety.reason.${r}`)}</span>
            </label>
          ))}
        </fieldset>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            {t('safety.detailLabel')}
          </span>
          <textarea
            value={detail}
            onChange={e => setDetail(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t('safety.detailPlaceholder')}
            className="w-full bg-surface-container-low rounded-xl p-3 text-sm text-on-surface border-none focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </label>

        <div className="bg-surface-container-low rounded-2xl p-4 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoBlock}
              onChange={e => setAlsoBlock(e.target.checked)}
              className="mt-0.5 accent-primary w-4 h-4 shrink-0"
            />
            <span className="text-sm font-medium text-on-surface">{t('safety.alsoBlock')}</span>
          </label>
          {/* Two different warnings, and both are load-bearing. This one is what the block COSTS
              the reader: the follow goes both ways and does not come back. It was missing here
              while the box was pre-checked, which is the whole reason this default changed. */}
          <p className="text-xs text-on-surface-variant leading-relaxed pl-7">{t('safety.alsoBlockHint')}</p>
          {/* E-8: a block is a tool between two accounts, not a privacy wall against the open web.
              Saying nothing here would let a reader believe they are hidden from the internet. */}
          <p className="text-xs text-on-surface-variant leading-relaxed pl-7">{t('safety.blockEffect')}</p>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm rounded-xl border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!reason || submitting}
            className="btn-primary px-5 py-2.5 text-sm rounded-xl disabled:opacity-50"
          >
            {submitting ? t('common.saving') : t('safety.submitReport')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

/**
 * The Report affordance. `variant="menu-item"` renders a row for a dropdown; anything else renders
 * a bare icon button for an action cluster.
 */
export default function ReportButton({ targetType, targetId, targetName, variant = 'icon', onDone, onReported }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const close = () => { setOpen(false); onDone?.() }

  return (
    <>
      {variant === 'menu-item' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-sm">flag</span>
          {t('safety.report')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t('safety.report')}
          aria-label={t('safety.report')}
          className="text-on-surface-variant/30 hover:text-error transition-colors"
        >
          <span className="material-symbols-outlined text-base">flag</span>
        </button>
      )}
      {open && (
        <ReportDialog
          targetType={targetType}
          targetId={targetId}
          targetName={targetName}
          onClose={close}
          onReported={onReported}
        />
      )}
    </>
  )
}
