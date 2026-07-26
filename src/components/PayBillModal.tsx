import { useEffect, useMemo, useState } from 'react'
import {
  applyPaySelection,
  lineUnpaidQty,
  markOrderPaid,
  markPartialPay,
  unpaidTotal,
} from '../lib/orders'
import { formatEuro } from '../utils/format'
import { sq } from '../i18n/sq'
import type { Order } from '../types'

export default function PayBillModal({
  order,
  staffId,
  onClose,
  onUpdated,
}: {
  order: Order
  staffId?: string | null
  onClose: () => void
  onUpdated: (order: Order) => void
}) {
  const [selection, setSelection] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const init: Record<string, number> = {}
    for (const line of order.items) {
      init[line.name] = 0
    }
    setSelection(init)
    setErr(null)
  }, [order.id])

  const preview = useMemo(
    () => applyPaySelection(order, selection),
    [order, selection]
  )

  const setQty = (name: string, qty: number, max: number) => {
    setSelection((prev) => ({
      ...prev,
      [name]: Math.max(0, Math.min(max, qty)),
    }))
  }

  const selectAllUnpaid = () => {
    const next: Record<string, number> = {}
    for (const line of order.items) {
      next[line.name] = lineUnpaidQty(line)
    }
    setSelection(next)
  }

  const paySelection = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    const { data, error, paidAmount } = await markPartialPay(
      order.id,
      selection,
      staffId
    )
    setBusy(false)
    if (error) {
      setErr(error)
      return
    }
    if (paidAmount <= 0) {
      setErr(sq.pickSomething)
      return
    }
    if (data) onUpdated(data)
    if (data && data.paid_at) onClose()
    else {
      // reset selection after partial
      const init: Record<string, number> = {}
      for (const line of data?.items ?? order.items) {
        init[line.name] = 0
      }
      setSelection(init)
    }
  }

  const payFull = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    const { data, error } = await markOrderPaid(order.id, staffId)
    setBusy(false)
    if (error) {
      setErr(error)
      return
    }
    if (data) onUpdated(data)
    onClose()
  }

  return (
    <div className="manual-sheet-backdrop" role="presentation">
      <div className="manual-sheet pay-sheet" role="dialog" aria-modal="true">
        <header className="manual-sheet-header">
          <div>
            <p className="manual-sheet-kicker">{sq.payment}</p>
            <h2>
              {sq.table} {order.table_number}
            </h2>
            <p className="pay-open-total">
              {sq.stillOwed}: <strong>{formatEuro(unpaidTotal(order))}</strong>
            </p>
          </div>
          <button type="button" className="manual-close-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="manual-sheet-body">
          <p className="manual-help">{sq.splitHint}</p>
          <ul className="pay-lines">
            {order.items.map((line) => {
              const unpaid = lineUnpaidQty(line)
              const sel = selection[line.name] ?? 0
              if (unpaid === 0) {
                return (
                  <li key={line.name} className="pay-line is-paid">
                    <span>
                      {line.quantity}× {line.name}
                    </span>
                    <em>{sq.paidLine}</em>
                  </li>
                )
              }
              return (
                <li key={line.name} className="pay-line">
                  <div className="pay-line-info">
                    <strong>
                      {line.name}
                    </strong>
                    <span>
                      {formatEuro(line.price)} · {sq.unpaidQty}: {unpaid}/
                      {line.quantity}
                    </span>
                  </div>
                  <div className="qty-controls qty-controls-lg">
                    <button
                      type="button"
                      className="qty-btn qty-btn-lg"
                      onClick={() => setQty(line.name, sel - 1, unpaid)}
                      disabled={sel <= 0}
                    >
                      −
                    </button>
                    <span className="qty-value qty-value-lg">{sel}</span>
                    <button
                      type="button"
                      className="qty-btn qty-btn-lg"
                      onClick={() => setQty(line.name, sel + 1, unpaid)}
                      disabled={sel >= unpaid}
                    >
                      +
                    </button>
                  </div>
                  <span className="pay-line-sum">
                    {formatEuro(sel * line.price)}
                  </span>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={selectAllUnpaid}
          >
            {sq.selectAllUnpaid}
          </button>
        </div>

        <footer className="manual-sheet-footer">
          <div className="manual-footer-meta">
            <span>{sq.thisPayment}</span>
            <strong>{formatEuro(preview.paidAmount)}</strong>
          </div>
          {err && <p className="form-error">{err}</p>}
          <button
            type="button"
            className="btn btn-primary btn-block btn-lg manual-confirm-btn"
            disabled={busy || preview.paidAmount <= 0}
            onClick={() => void paySelection()}
          >
            {busy ? sq.sending : sq.paySelection}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block btn-lg"
            disabled={busy}
            onClick={() => void payFull()}
          >
            {sq.payFull} ({formatEuro(unpaidTotal(order))})
          </button>
        </footer>
      </div>
    </div>
  )
}
