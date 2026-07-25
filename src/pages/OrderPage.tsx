import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { menu, MENU_TITLE, SHOP_NAME } from '../data/menu'
import { useCart } from '../hooks/useCart'
import { createOrder } from '../lib/orders'
import { formatEuro } from '../utils/format'
import { sq } from '../i18n/sq'
import type { CartItem } from '../types'

type Screen = 'menu' | 'review' | 'confirmation'

export default function OrderPage() {
  const [searchParams] = useSearchParams()
  const tableParam = searchParams.get('table')
  const tableNumber = tableParam ? Number.parseInt(tableParam, 10) : NaN
  const hasValidTable =
    Number.isInteger(tableNumber) && tableNumber > 0 && tableNumber < 1000

  const cart = useCart()
  const [screen, setScreen] = useState<Screen>('menu')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastOrder, setLastOrder] = useState<{
    items: CartItem[]
    total: number
  } | null>(null)

  const handleSubmit = async () => {
    if (cart.items.length === 0 || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    const { error } = await createOrder(tableNumber, cart.items, cart.total)
    setSubmitting(false)
    if (error) {
      setSubmitError(error)
      return
    }
    setLastOrder({ items: cart.items, total: cart.total })
    cart.clear()
    setScreen('confirmation')
  }

  if (!hasValidTable) {
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
          <p className="order-confirm-sub">{sq.bringToTable(tableNumber)}</p>
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
      <div className="order-page">
        <header className="order-header">
          <button
            type="button"
            className="back-link"
            onClick={() => setScreen('menu')}
          >
            {sq.backToMenu}
          </button>
          <h1 className="review-title">{sq.yourOrder}</h1>
          <p className="order-table-label">
            {sq.table} {tableNumber}
          </p>
        </header>

        <main className="review-main">
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
          {submitError && <p className="form-error">{submitError}</p>}
        </main>

        {cart.items.length > 0 && (
          <footer className="review-footer">
            <div className="review-total-row">
              <span>{sq.total}</span>
              <strong>{formatEuro(cart.total)}</strong>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block btn-lg"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? sq.sending : sq.placeOrder}
            </button>
          </footer>
        )}
      </div>
    )
  }

  return (
    <div className={`order-page ${cart.itemCount > 0 ? 'has-cart-bar' : ''}`}>
      <header className="order-header">
        <div className="order-brand">
          <span className="order-brand-mark" aria-hidden>
            ☀
          </span>
          <div className="order-brand-text">
            <p className="order-menu-kicker">{MENU_TITLE}</p>
            <h1 className="order-shop-name">{SHOP_NAME}</h1>
          </div>
        </div>
        <p className="order-table-label">
          {sq.table} {tableNumber}
        </p>
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
          className="cart-bar"
          onClick={() => setScreen('review')}
        >
          <span className="cart-bar-count">
            {cart.itemCount}{' '}
            {cart.itemCount === 1 ? sq.itemOne : sq.items}
          </span>
          <span className="cart-bar-total">{formatEuro(cart.total)}</span>
          <span className="cart-bar-cta">{sq.viewOrder}</span>
        </button>
      )}
    </div>
  )
}
