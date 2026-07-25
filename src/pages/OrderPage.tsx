import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { menu, SHOP_NAME } from '../data/menu'
import { useCart } from '../hooks/useCart'
import { createOrder } from '../lib/orders'
import { formatEuro } from '../utils/format'
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

  const categories = menu.categories

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

  const startNewOrder = () => {
    setLastOrder(null)
    setSubmitError(null)
    setScreen('menu')
  }

  if (!hasValidTable) {
    return (
      <div className="order-page order-error-page">
        <div className="order-error-card">
          <div className="order-error-icon" aria-hidden>
            ⌗
          </div>
          <h1>Table not found</h1>
          <p>Please scan the QR code at your table to open the menu.</p>
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
          <h1>Your order has been sent!</h1>
          <p className="order-confirm-sub">
            We&apos;ll bring it to table {tableNumber}.
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
              <div className="order-confirm-total">
                <span>Total</span>
                <span>{formatEuro(lastOrder.total)}</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={startNewOrder}
          >
            Order something else
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
            ← Back to menu
          </button>
          <h1 className="review-title">Your order</h1>
          <p className="order-table-label">Table {tableNumber}</p>
        </header>

        <main className="review-main">
          {cart.items.length === 0 ? (
            <p className="empty-cart">No items yet. Add something from the menu.</p>
          ) : (
            <ul className="review-list">
              {cart.items.map((item) => (
                <li key={item.name} className="review-item">
                  <div className="review-item-info">
                    <span className="review-item-name">{item.name}</span>
                    <span className="review-item-price">
                      {formatEuro(item.price)} each
                    </span>
                  </div>
                  <div className="qty-controls">
                    <button
                      type="button"
                      className="qty-btn"
                      aria-label={`Decrease ${item.name}`}
                      onClick={() => cart.removeItem(item.name)}
                    >
                      −
                    </button>
                    <span className="qty-value">{item.quantity}</span>
                    <button
                      type="button"
                      className="qty-btn"
                      aria-label={`Increase ${item.name}`}
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
              <span>Total</span>
              <strong>{formatEuro(cart.total)}</strong>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Sending…' : 'Place Order'}
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
            ◎
          </span>
          <h1 className="order-shop-name">{SHOP_NAME}</h1>
        </div>
        <p className="order-table-label">Table {tableNumber}</p>
      </header>

      <main className="menu-main">
        {categories.map((category) => (
          <section key={category.name} className="menu-section">
            <h2 className="menu-category">{category.name}</h2>
            <ul className="menu-list">
              {category.items.map((item) => {
                const qty = cart.getQuantity(item.name)
                return (
                  <li key={item.name}>
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
                          <span className="menu-item-badge" aria-label={`${qty} selected`}>
                            {qty}
                          </span>
                        )}
                      </span>
                    </button>
                    {qty > 0 && (
                      <div className="menu-item-actions">
                        <button
                          type="button"
                          className="qty-btn qty-btn-sm"
                          aria-label={`Remove one ${item.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            cart.removeItem(item.name)
                          }}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className="qty-btn qty-btn-sm"
                          aria-label={`Add one ${item.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            cart.addItem(item)
                          }}
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
            {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
          </span>
          <span className="cart-bar-total">{formatEuro(cart.total)}</span>
          <span className="cart-bar-cta">View Order</span>
        </button>
      )}
    </div>
  )
}
