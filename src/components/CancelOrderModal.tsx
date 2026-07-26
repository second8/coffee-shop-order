import { useEffect, useState } from 'react'
import { sq } from '../i18n/sq'

export default function CancelOrderModal({
  tableNumber,
  onClose,
  onConfirm,
}: {
  tableNumber: number
  onClose: () => void
  onConfirm: (reason: string) => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setReason('')
    setErr(null)
    setBusy(false)
  }, [tableNumber])

  const submit = async () => {
    const t = reason.trim()
    if (t.length < 3) {
      setErr(sq.cancelReasonTooShort)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await onConfirm(t)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
      setBusy(false)
    }
  }

  return (
    <div className="manual-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cancel-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{sq.cancelOrderTitle}</h2>
        <p className="cancel-modal-sub">
          {sq.table} {tableNumber} — {sq.cancelReasonHint}
        </p>
        <textarea
          className="order-note-input"
          rows={3}
          maxLength={200}
          autoFocus
          placeholder={sq.cancelReasonPlaceholder}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {err && <p className="form-error">{err}</p>}
        <div className="cancel-modal-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            {sq.close}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void submit()}
          >
            {busy ? sq.sending : sq.confirmCancelBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
