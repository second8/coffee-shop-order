import { useEffect, useMemo, useState } from 'react'
import {
  markPartialPay,
  markTablePaid,
  tableBillLines,
  type TableBill,
} from '../lib/orders'
import { formatEuro } from '../utils/format'
import { sq } from '../i18n/sq'

export default function TablePayModal({
  bill,
  staffId,
  onClose,
  onPaid,
}: {
  bill: TableBill
  staffId?: string | null
  onClose: () => void
  onPaid: () => void
}) {
  const lines = useMemo(() => tableBillLines(bill), [bill])
  const [selection, setSelection] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const init: Record<string, number> = {}
    for (const line of lines) init[line.key] = 0
    setSelection(init)
    setErr(null)
  }, [bill.table, bill.ticketCount, lines])

  const payAmount = useMemo(() => {
    let s = 0
    for (const line of lines) {
      const n = Math.min(line.unpaid, Math.floor(selection[line.key] ?? 0))
      s += n * line.price
    }
    return s
  }, [lines, selection])

  const setQty = (key: string, qty: number, max: number) => {
    setSelection((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(max, qty)),
    }))
  }

  const selectAll = () => {
    const next: Record<string, number> = {}
    for (const line of lines) next[line.key] = line.unpaid
    setSelection(next)
  }

  const payFull = async () => {
    if (busy) return
    if (bill.hasPending) {
      setErr(sq.waitKitchenBeforePay)
      return
    }
    setBusy(true)
    setErr(null)
    const { error } = await markTablePaid(bill.table, bill.orders, staffId)
    setBusy(false)
    if (error) {
      setErr(error)
      return
    }
    onPaid()
    onClose()
  }

  const paySelection = async () => {
    if (busy) return
    if (bill.hasPending) {
      setErr(sq.waitKitchenBeforePay)
      return
    }
    if (payAmount <= 0) {
      setErr(sq.pickSomething)
      return
    }
    setBusy(true)
    setErr(null)

    // Group selection by orderId → item name → qty
    const byOrder = new Map<string, Record<string, number>>()
    for (const line of lines) {
      const n = Math.min(line.unpaid, Math.floor(selection[line.key] ?? 0))
      if (n <= 0) continue
      const map = byOrder.get(line.orderId) ?? {}
      map[line.name] = (map[line.name] ?? 0) + n
      byOrder.set(line.orderId, map)
    }

    for (const [orderId, sel] of byOrder) {
      const { error } = await markPartialPay(orderId, sel, staffId)
      if (error) {
        setBusy(false)
        setErr(error)
        return
      }
    }

    setBusy(false)
    onPaid()
    onClose()
  }

  return (
    <div className="manual-sheet-backdrop" role="presentation">
      <div className="manual-sheet pay-sheet" role="dialog" aria-modal="true">
        <header className="manual-sheet-header">
          <div>
            <p className="manual-sheet-kicker">{sq.payment}</p>
            <h2>
              {sq.table} {bill.table}
            </h2>
            <p className="pay-open-total">
              {sq.stillOwed}: <strong>{formatEuro(bill.unpaid)}</strong>
              <span className="pay-ticket-meta">
                {' '}
                · {bill.ticketCount} {sq.kitchenTickets}
              </span>
            </p>
            {bill.hasPending && (
              <p className="pay-kitchen-wait">{sq.waitKitchenBeforePay}</p>
            )}
            {bill.allReady && (
              <p className="pay-kitchen-ready">{sq.readyKitchen}</p>
            )}
          </div>
          <button type="button" className="manual-close-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="manual-sheet-body">
          <p className="manual-help">{sq.splitHint}</p>
          <ul className="pay-lines">
            {lines.map((line) => {
              const sel = selection[line.key] ?? 0
              return (
                <li key={line.key} className="pay-line">
                  <div className="pay-line-info">
                    <strong>{line.name}</strong>
                    <span>
                      {formatEuro(line.price)} · {sq.unpaidQty}: {line.unpaid}
                    </span>
                  </div>
                  <div className="qty-controls qty-controls-lg">
                    <button
                      type="button"
                      className="qty-btn qty-btn-lg"
                      disabled={sel <= 0 || bill.hasPending}
                      onClick={() => setQty(line.key, sel - 1, line.unpaid)}
                    >
                      −
                    </button>
                    <span className="qty-value qty-value-lg">{sel}</span>
                    <button
                      type="button"
                      className="qty-btn qty-btn-lg"
                      disabled={sel >= line.unpaid || bill.hasPending}
                      onClick={() => setQty(line.key, sel + 1, line.unpaid)}
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
            disabled={bill.hasPending}
            onClick={selectAll}
          >
            {sq.selectAllUnpaid}
          </button>
        </div>

        <footer className="manual-sheet-footer">
          <div className="manual-footer-meta">
            <span>{sq.thisPayment}</span>
            <strong>{formatEuro(payAmount)}</strong>
          </div>
          {err && <p className="form-error">{err}</p>}
          <button
            type="button"
            className="btn btn-primary btn-block btn-lg manual-confirm-btn"
            disabled={busy || payAmount <= 0 || bill.hasPending}
            onClick={() => void paySelection()}
          >
            {busy ? sq.sending : sq.paySelection}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block btn-lg"
            disabled={busy || bill.hasPending || bill.unpaid <= 0}
            onClick={() => void payFull()}
          >
            {sq.payFullTable} ({formatEuro(bill.unpaid)})
          </button>
          {bill.hasPending && (
            <p className="pay-disabled-hint">{sq.payWhenReadyHint}</p>
          )}
        </footer>
      </div>
    </div>
  )
}
