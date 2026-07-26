import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { menu, MENU_TITLE, SHOP_NAME } from '../data/menu'
import {
  CLIENT_MIN_ORDER_EUR,
  CLIENT_TABLE_SENTINEL,
  sanitizeClientName,
} from '../data/stickers'
import { useCart } from '../hooks/useCart'
import { createOrder } from '../lib/orders'
import { formatEuro } from '../utils/format'
import { sq } from '../i18n/sq'
import type { CartItem } from '../types'

type Screen = 'menu' | 'review' | 'confirmation'

export default function OrderPage() {
  const [searchParams] = useSearchParams()
  const tableParam = searchParams.get('table')
  // Accept client / c / name query keys (QR uses ?client=)
  const clientRaw =
    searchParams.get('client') ||
    searchParams.get('c') ||
    searchParams.get('name')
  const clientName = clientRaw ? sanitizeClientName(clientRaw) : null
  // If sanitize rejected but raw looks like a name, still use a trimmed version
  const clientNameLoose =
    clientName ||
    (clientRaw
      ? clientRaw.trim().replace(/\s+/g, ' ').slice(0, 48) || null
      : null)
  const resolvedClient =
    clientNameLoose && clientNameLoose.length >= 2 ? clientNameLoose : null
  const tableNumber = tableParam ? Number.parseInt(tableParam, 10) : NaN
  const hasValidTable =
    !resolvedClient &&
    Number.isInteger(tableNumber) &&
    tableNumber > 0 &&
    tableNumber < 1000
  const isClientDest = Boolean(resolvedClient)
  const hasValidDest = isClientDest || hasValidTable

  const cart = useCart()
  const [screen, setScreen] = useState<Screen>('menu')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const submitLock = useRef(false)
  const [lastOrder, setLastOrder] = useState<{
    items: CartItem[]
    total: number
    note: string | null
  } | null>(null)

  const belowMin =
    isClientDest && cart.itemCount > 0 && cart.total < CLIENT_MIN_ORDER_EUR
  const minRemaining = Math.max(0, CLIENT_MIN_ORDER_EUR - cart.total)

  const handleSubmit = async () => {
    if (cart.items.length === 0 || submitting || submitLock.current) return
    if (belowMin) {
      setSubmitError(sq.clientMinOrder(CLIENT_MIN_ORDER_EUR))
      return
    }
    submitLock.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { error } = await createOrder(
        isClientDest ? CLIENT_TABLE_SENTINEL : tableNumber,
        cart.items,
        cart.total,
        note,
        isClientDest ? { clientName: resolvedClient } : undefined
      )
      if (error) {
        setSubmitError(error || sq.orderFailed)
        return
      }
      setLastOrder({
        items: cart.items,
        total: cart.total,
        note: note.trim() || null,
      })
      cart.clear()
      setNote('')
      setScreen('confirmation')
    } catch {
      setSubmitError(sq.orderFailed)
    } finally {
      setSubmitting(false)
      submitLock.current = false
    }
  }

  if (!hasValidDest) {
    return (
      <div className="order-page order-error-page">
        <div className="order-error-card">
          <div className="order-error-icon" aria-hidden>
            ⌗
          </div>
          <h1>{sq.tableNotFound}</h1>
          <p>{sq.tableNotFoundHint}</p>
        </div>
      </div>
    )
  }

  if (screen === 'confirmation') {
    return (
      <div className="order-page order-confirm-page">
        <div className="order-confirm-card">
          <div className="order-confirm-check" aria-hidden>
            ✓
          </div>
          <h1>{sq.orderSent}</h1>
          <p className="order-confirm-sub">
            {isClientDest
              ? sq.bringToOffice(resolvedClient!)
              : sq.bringToTable()}
          </p>
          {lastOrder && (
            <div className="order-confirm-summary">
              {lastOrder.items.map((item) => (
                <div key={item.name} className="order-confirm-line">
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <span>{formatEuro(item.price * item.quantity)}</span>
                </div>
              ))}
              {lastOrder.note && (
                <p className="order-confirm-note">
                  <strong>{sq.noteLabel}:</strong> {lastOrder.note}
                </p>
              )}
              <div className="order-confirm-total">
                <span>{sq.total}</span>
                <span>{formatEuro(lastOrder.total)}</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              setLastOrder(null)
              setSubmitError(null)
              setNote('')
              setScreen('menu')
            }}
          >
            {sq.orderAgain}
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'review') {
    return (
      <div
        className={`order-page order-review-page ${isClientDest ? 'is-client-dest' : ''}`}
      >
        <header className="order-header">
          <button
            type="button"
            className="back-link"
            onClick={() => setScreen('menu')}
          >
            {sq.backToMenu}
          </button>
          <h1 className="review-title">{sq.yourOrder}</h1>
          {isClientDest && (
            <p className="client-dest-banner">
              {sq.officeOrder} · {resolvedClient}
            </p>
          )}
        </header>

        <main className="review-main review-main-scroll">
          {cart.items.length === 0 ? (
            <p className="empty-cart">{sq.emptyCart}</p>
          ) : (
            <ul className="review-list">
              {cart.items.map((item) => (
                <li key={item.name} className="review-item">
                  <div className="review-item-info">
                    <span className="review-item-name">{item.name}</span>
                    <span className="review-item-price">
                      {formatEuro(item.price)}
                    </span>
                  </div>
                  <div className="qty-controls qty-controls-lg">
                    <button
                      type="button"
                      className="qty-btn qty-btn-lg"
                      aria-label={`Ul ${item.name}`}
                      onClick={() => cart.removeItem(item.name)}
                    >
                      −
                    </button>
                    <span className="qty-value qty-value-lg">{item.quantity}</span>
                    <button
                      type="button"
                      className="qty-btn qty-btn-lg"
                      aria-label={`Shto ${item.name}`}
                      onClick={() =>
                        cart.addItem({ name: item.name, price: item.price })
                      }
                    >
                      +
                    </button>
                  </div>
                  <span className="review-item-total">
                    {formatEuro(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {cart.items.length > 0 && (
            <>
              <div className="order-note-field">
                <label className="order-note-label" htmlFor="order-note">
                  {sq.orderNote}
                </label>
                <p className="order-note-hint">{sq.orderNoteHint}</p>
                <textarea
                  id="order-note"
                  className="order-note-input"
                  rows={3}
                  maxLength={280}
                  placeholder={sq.orderNotePlaceholder}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  enterKeyHint="done"
                />
              </div>

              <div className="review-submit-block">
                <div className="review-total-row">
                  <span>{sq.total}</span>
                  <strong>{formatEuro(cart.total)}</strong>
                </div>
                {belowMin && (
                  <p className="form-error client-min-hint">
                    {sq.clientMinOrderNeed(
                      CLIENT_MIN_ORDER_EUR,
                      minRemaining
                    )}
                  </p>
                )}
                {submitError && <p className="form-error">{submitError}</p>}
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg"
                  disabled={submitting || belowMin}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? sq.sending : sq.placeOrder}
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    )
  }

  return (
    <div
      className={`order-page ${cart.itemCount > 0 ? 'has-cart-bar' : ''} ${isClientDest ? 'is-client-dest' : ''}`}
    >
      <header className="order-header">
        <div className="order-brand-text">
          <p className="order-menu-kicker">{MENU_TITLE}</p>
          <h1 className="order-shop-name">{SHOP_NAME}</h1>
          {isClientDest && (
            <p className="client-dest-banner">
              {sq.officeOrder} · {resolvedClient}
            </p>
          )}
        </div>
      </header>

      <main className="menu-main">
        {menu.categories.map((category) => (
          <section key={category.name} className="menu-section">
            <h2 className="menu-category">{category.name}</h2>
            <ul className="menu-list">
              {category.items.map((item) => {
                const qty = cart.getQuantity(item.name)
                return (
                  <li key={item.name} className="menu-row">
                    <button
                      type="button"
                      className={`menu-item ${qty > 0 ? 'is-selected' : ''}`}
                      onClick={() => cart.addItem(item)}
                    >
                      <span className="menu-item-name">{item.name}</span>
                      <span className="menu-item-meta">
                        <span className="menu-item-price">
                          {formatEuro(item.price)}
                        </span>
                        {qty > 0 && (
                          <span className="menu-item-badge">{qty}</span>
                        )}
                      </span>
                    </button>
                    {qty > 0 && (
                      <div className="menu-item-actions">
                        <button
                          type="button"
                          className="qty-btn qty-btn-lg"
                          aria-label={`Hiq ${item.name}`}
                          onClick={() => cart.removeItem(item.name)}
                        >
                          −
                        </button>
                        <span className="qty-value qty-value-lg">{qty}</span>
                        <button
                          type="button"
                          className="qty-btn qty-btn-lg"
                          aria-label={`Shto ${item.name}`}
                          onClick={() => cart.addItem(item)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>

      {cart.itemCount > 0 && (
        <button
          type="button"
          className={`cart-bar ${belowMin ? 'is-below-min' : ''}`}
          onClick={() => setScreen('review')}
        >
          <span className="cart-bar-count">
            {cart.itemCount}{' '}
            {cart.itemCount === 1 ? sq.itemOne : sq.items}
            {belowMin
              ? ` · min €${CLIENT_MIN_ORDER_EUR}`
              : ''}
          </span>
          <span className="cart-bar-total">{formatEuro(cart.total)}</span>
          <span className="cart-bar-cta">{sq.viewOrder}</span>
        </button>
      )}
    </div>
  )
}
