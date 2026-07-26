import { useEffect, useMemo, useState } from 'react'
import {
  markPartialPay,
  markTablePaid,
  tableBillLines,
  type TableBill,
} from '../lib/orders'
import { formatEuro } from '../utils/format'
import { sq } from '../i18n/sq'

type Mode = 'items' | 'equal'

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
  const [mode, setMode] = useState<Mode>('items')
  const [people, setPeople] = useState(2)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const init: Record<string, number> = {}
    for (const line of lines) init[line.key] = 0
    setSelection(init)
    setErr(null)
  }, [bill.table, bill.ticketCount, bill.unpaid, lines])

  const payAmount = useMemo(() => {
    let s = 0
    for (const line of lines) {
      const n = Math.min(line.unpaid, Math.floor(selection[line.key] ?? 0))
      s += n * line.price
    }
    return s
  }, [lines, selection])

  const remainingAfter = Math.max(0, bill.unpaid - payAmount)

  const selectedLines = useMemo(() => {
    return lines
      .map((line) => {
        const n = Math.min(line.unpaid, Math.floor(selection[line.key] ?? 0))
        if (n <= 0) return null
        return {
          name: line.name,
          qty: n,
          left: line.unpaid - n,
          total: n * line.price,
          unit: line.price,
        }
      })
      .filter(Boolean) as {
      name: string
      qty: number
      left: number
      total: number
      unit: number
    }[]
  }, [lines, selection])

  const equalShare =
    people >= 1 ? Math.round((bill.unpaid / people) * 100) / 100 : 0
  // last person absorbs rounding
  const equalShares = useMemo(() => {
    if (people < 1 || bill.unpaid <= 0) return [] as number[]
    const base = Math.floor((bill.unpaid / people) * 100) / 100
    const parts = Array.from({ length: people }, () => base)
    const sum = base * people
    const diff = Math.round((bill.unpaid - sum) * 100) / 100
    if (parts.length > 0) {
      parts[parts.length - 1] = Math.round((parts[parts.length - 1]! + diff) * 100) / 100
    }
    return parts
  }, [bill.unpaid, people])

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

  const clearSel = () => {
    const next: Record<string, number> = {}
    for (const line of lines) next[line.key] = 0
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

  const payEqual = async () => {
    // Equal split is informational + pays full table once people settle
    // Kamerier confirms full table paid after collecting equal shares
    await payFull()
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

    const byOrder = new Map<string, Record<string, number>>()
    for (const line of lines) {
      const n = Math.min(line.unpaid, Math.floor(selection[line.key] ?? 0))
      if (n <= 0) continue
      const map = byOrder.get(line.orderId) ?? {}
      map[line.name] = (map[line.name] ?? 0) + n
      byOrder.set(line.orderId, map)
    }

    for (const [orderId, sel] of byOrder) {
      const { error } = await markPartialPay(orderId, sel, staffId, {
        note: 'Pagesë për person (zgjedhje artikujsh)',
      })
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
            <div className="pay-summary-bar">
              <div>
                <span className="pay-sum-label">{sq.stillOwed}</span>
                <strong className="pay-sum-value">
                  {formatEuro(bill.unpaid)}
                </strong>
              </div>
              <div>
                <span className="pay-sum-label">{sq.thisPayment}</span>
                <strong className="pay-sum-value pay-sum-now">
                  {formatEuro(mode === 'equal' ? bill.unpaid : payAmount)}
                </strong>
              </div>
              <div>
                <span className="pay-sum-label">{sq.leftAfterPay}</span>
                <strong className="pay-sum-value">
                  {formatEuro(mode === 'equal' ? 0 : remainingAfter)}
                </strong>
              </div>
            </div>
            {bill.hasPending && (
              <p className="pay-kitchen-wait">{sq.waitKitchenBeforePay}</p>
            )}
          </div>
          <button type="button" className="manual-close-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="manual-steps">
          <button
            type="button"
            className={`manual-step ${mode === 'items' ? 'is-active' : ''}`}
            onClick={() => setMode('items')}
          >
            {sq.payPerPerson}
          </button>
          <button
            type="button"
            className={`manual-step ${mode === 'equal' ? 'is-active' : ''}`}
            onClick={() => setMode('equal')}
          >
            {sq.equalSplit}
          </button>
        </div>

        <div className="manual-sheet-body">
          {mode === 'items' && (
            <>
              <p className="manual-help">{sq.payPerPersonHint}</p>
              <ul className="pay-lines">
                {lines.map((line) => {
                  const sel = selection[line.key] ?? 0
                  const left = line.unpaid - sel
                  return (
                    <li
                      key={line.key}
                      className={`pay-line ${sel > 0 ? 'is-picking' : ''}`}
                    >
                      <div className="pay-line-info">
                        <strong>{line.name}</strong>
                        <span>
                          {formatEuro(line.price)} · {sq.onBill}: {line.unpaid}
                        </span>
                        {sel > 0 && (
                          <span className="pay-line-live">
                            {sq.payingNow}: <b>{sel}</b> · {sq.leftOnItem}:{' '}
                            <b>{left}</b>
                          </span>
                        )}
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
              <div className="pay-quick-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={bill.hasPending}
                  onClick={selectAll}
                >
                  {sq.selectAllUnpaid}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={payAmount <= 0}
                  onClick={clearSel}
                >
                  {sq.clearSelection}
                </button>
              </div>

              {selectedLines.length > 0 && (
                <div className="pay-receipt">
                  <h3>{sq.personIsPaying}</h3>
                  <ul>
                    {selectedLines.map((l) => (
                      <li key={l.name}>
                        <span>
                          {l.qty}× {l.name}
                        </span>
                        <span>{formatEuro(l.total)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pay-receipt-total">
                    <span>{sq.thisPayment}</span>
                    <strong>{formatEuro(payAmount)}</strong>
                  </div>
                  <div className="pay-receipt-left">
                    <span>{sq.leftAfterPay}</span>
                    <strong>{formatEuro(remainingAfter)}</strong>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'equal' && (
            <div className="equal-split-panel">
              <p className="manual-help">{sq.equalSplitHint}</p>
              <div className="people-stepper">
                <span>{sq.howManyPeople}</span>
                <div className="qty-controls qty-controls-lg">
                  <button
                    type="button"
                    className="qty-btn qty-btn-lg"
                    disabled={people <= 1}
                    onClick={() => setPeople((p) => Math.max(1, p - 1))}
                  >
                    −
                  </button>
                  <span className="qty-value qty-value-lg">{people}</span>
                  <button
                    type="button"
                    className="qty-btn qty-btn-lg"
                    disabled={people >= 20}
                    onClick={() => setPeople((p) => Math.min(20, p + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="equal-share-card">
                <span>{sq.eachPersonPays}</span>
                <strong>{formatEuro(equalShare)}</strong>
              </div>
              <ul className="equal-list">
                {equalShares.map((amt, i) => (
                  <li key={i}>
                    <span>
                      {sq.person} {i + 1}
                    </span>
                    <strong>{formatEuro(amt)}</strong>
                  </li>
                ))}
              </ul>
              <p className="pay-disabled-hint">{sq.equalSplitConfirmHint}</p>
            </div>
          )}
        </div>

        <footer className="manual-sheet-footer">
          <div className="manual-footer-meta pay-footer-grid">
            <div>
              <span className="pay-sum-label">{sq.thisPayment}</span>
              <strong>
                {formatEuro(mode === 'equal' ? bill.unpaid : payAmount)}
              </strong>
            </div>
            <div>
              <span className="pay-sum-label">{sq.leftAfterPay}</span>
              <strong>
                {formatEuro(mode === 'equal' ? 0 : remainingAfter)}
              </strong>
            </div>
          </div>
          {err && <p className="form-error">{err}</p>}

          {mode === 'items' && (
            <button
              type="button"
              className="btn btn-primary btn-block btn-lg manual-confirm-btn"
              disabled={busy || payAmount <= 0 || bill.hasPending}
              onClick={() => void paySelection()}
            >
              {busy ? sq.sending : `${sq.confirmPersonPay} · ${formatEuro(payAmount)}`}
            </button>
          )}

          {mode === 'equal' && (
            <button
              type="button"
              className="btn btn-primary btn-block btn-lg manual-confirm-btn"
              disabled={busy || bill.hasPending || bill.unpaid <= 0}
              onClick={() => void payEqual()}
            >
              {busy
                ? sq.sending
                : `${sq.payFullTable} · ${formatEuro(bill.unpaid)}`}
            </button>
          )}

          {mode === 'items' && (
            <button
              type="button"
              className="btn btn-secondary btn-block btn-lg"
              disabled={busy || bill.hasPending || bill.unpaid <= 0}
              onClick={() => void payFull()}
            >
              {sq.payFullTable} ({formatEuro(bill.unpaid)})
            </button>
          )}

          {bill.hasPending && (
            <p className="pay-disabled-hint">{sq.payWhenReadyHint}</p>
          )}
        </footer>
      </div>
    </div>
  )
}
