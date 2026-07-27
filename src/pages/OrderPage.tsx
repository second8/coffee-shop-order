import { useEffect, useRef, useState } from 'react'
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

function catId(name: string) {
  return `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export default function OrderPage() {
  const [searchParams] = useSearchParams()
  const tableParam = searchParams.get('table')
  const clientRaw =
    searchParams.get('client') ||
    searchParams.get('c') ||
    searchParams.get('name')
  const clientName = clientRaw ? sanitizeClientName(clientRaw) : null
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
  const [activeCat, setActiveCat] = useState(menu.categories[0]?.name ?? '')
  const submitLock = useRef(false)
  const [lastOrder, setLastOrder] = useState<{
    items: CartItem[]
    total: number
    note: string | null
  } | null>(null)

  const belowMin =
    isClientDest && cart.itemCount > 0 && cart.total < CLIENT_MIN_ORDER_EUR
  const minRemaining = Math.max(0, CLIENT_MIN_ORDER_EUR - cart.total)

  const destLabel = isClientDest
    ? resolvedClient!
    : `${sq.table} ${tableNumber}`

  useEffect(() => {
    if (screen !== 'menu') return
    const sections = menu.categories
      .map((c) => document.getElementById(catId(c.name)))
      .filter(Boolean) as HTMLElement[]
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target?.id) {
          const name = menu.categories.find(
            (c) => catId(c.name) === visible.target.id
          )?.name
          if (name) setActiveCat(name)
        }
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0.1, 0.35, 0.6] }
    )
    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [screen])

  const scrollToCat = (name: string) => {
    setActiveCat(name)
    document.getElementById(catId(name))?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

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
      <div className="phm-order">
        <header className="phm-topnav">
          <span className="phm-wordmark">PHM</span>
        </header>
        <div className="phm-checkered" aria-hidden />
        <section className="phm-error-panel">
          <p className="phm-caption">Error</p>
          <h1 className="phm-section-title">{sq.tableNotFound}</h1>
          <p className="phm-body-copy">{sq.tableNotFoundHint}</p>
        </section>
      </div>
    )
  }

  if (screen === 'confirmation') {
    return (
      <div className="phm-order phm-confirm">
        <div className="phm-confirm-panel">
          <p className="phm-caption phm-caption--on-gold">OK</p>
          <h1 className="phm-display-title phm-display-title--sm">
            {sq.orderSent}
          </h1>
          <p className="phm-hero-lead">
            {isClientDest
              ? sq.bringToOffice(resolvedClient!)
              : sq.bringToTable()}
          </p>
          {lastOrder && (
            <div className="phm-confirm-lines">
              {lastOrder.items.map((item) => (
                <div key={item.name} className="phm-confirm-line">
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <span>{formatEuro(item.price * item.quantity)}</span>
                </div>
              ))}
              {lastOrder.note && (
                <p className="phm-confirm-note">
                  <strong>{sq.noteLabel}:</strong> {lastOrder.note}
                </p>
              )}
              <div className="phm-confirm-total">
                <span>{sq.total}</span>
                <span>{formatEuro(lastOrder.total)}</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="phm-pill-btn phm-pill-btn--ink"
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
        <div className="phm-checkered phm-checkered--tall" aria-hidden />
      </div>
    )
  }

  if (screen === 'review') {
    return (
      <div
        className={`phm-order phm-review ${isClientDest ? 'is-client-dest' : ''}`}
      >
        <header className="phm-topnav">
          <button
            type="button"
            className="phm-nav-link phm-nav-btn"
            onClick={() => setScreen('menu')}
          >
            {sq.backToMenu}
          </button>
          <span className="phm-topnav-meta">{destLabel}</span>
        </header>
        <div className="phm-checkered" aria-hidden />

        <section className="phm-hero-ink">
          <p className="phm-caption phm-caption--on-ink">{sq.yourOrder}</p>
          <h1 className="phm-section-title phm-section-title--on-ink">
            {destLabel}
          </h1>
          {isClientDest && (
            <p className="phm-client-tag">{sq.officeOrder}</p>
          )}
        </section>

        <main className="phm-review-body">
          {cart.items.length === 0 ? (
            <p className="phm-empty">{sq.emptyCart}</p>
          ) : (
            <ul className="phm-review-list">
              {cart.items.map((item) => (
                <li key={item.name} className="phm-review-row">
                  <div className="phm-review-row-top">
                    <span className="phm-item-name">{item.name}</span>
                    <span className="phm-item-price">
                      {formatEuro(item.price * item.quantity)}
                    </span>
                  </div>
                  <div className="phm-qty-row">
                    <button
                      type="button"
                      className="phm-qty"
                      aria-label={`Ul ${item.name}`}
                      onClick={() => cart.removeItem(item.name)}
                    >
                      −
                    </button>
                    <span className="phm-qty-val">{item.quantity}</span>
                    <button
                      type="button"
                      className="phm-qty"
                      aria-label={`Shto ${item.name}`}
                      onClick={() =>
                        cart.addItem({ name: item.name, price: item.price })
                      }
                    >
                      +
                    </button>
                    <span className="phm-unit-price">
                      {formatEuro(item.price)} / copë
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {cart.items.length > 0 && (
            <>
              <div className="phm-note-block">
                <label className="phm-caption" htmlFor="order-note">
                  {sq.orderNote}
                </label>
                <p className="phm-note-hint">{sq.orderNoteHint}</p>
                <textarea
                  id="order-note"
                  className="phm-note-input"
                  rows={3}
                  maxLength={280}
                  placeholder={sq.orderNotePlaceholder}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  enterKeyHint="done"
                />
              </div>

              {belowMin && (
                <p className="phm-form-error">
                  {sq.clientMinOrderNeed(CLIENT_MIN_ORDER_EUR, minRemaining)}
                </p>
              )}
              {submitError && (
                <p className="phm-form-error">{submitError}</p>
              )}
            </>
          )}
        </main>

        {cart.items.length > 0 && (
          <div className="phm-sticky-cta">
            <div className="phm-sticky-meta">
              <span>{sq.total}</span>
              <strong>{formatEuro(cart.total)}</strong>
            </div>
            <button
              type="button"
              className="phm-full-cta"
              disabled={submitting || belowMin}
              onClick={() => void handleSubmit()}
            >
              {submitting ? sq.sending : `${sq.placeOrder}  →`}
            </button>
          </div>
        )}
      </div>
    )
  }

  /* ——— MENU (main ordering UX) ——— */
  return (
    <div
      className={`phm-order ${cart.itemCount > 0 ? 'has-sticky-cta' : ''} ${isClientDest ? 'is-client-dest' : ''}`}
    >
      <header className="phm-topnav phm-topnav--sticky">
        <span className="phm-wordmark">PHM</span>
        <div className="phm-topnav-meta-col">
          <span className="phm-topnav-meta">{destLabel}</span>
          {isClientDest && (
            <span className="phm-client-chip">{sq.officeBadge}</span>
          )}
        </div>
      </header>
      <div className="phm-checkered" aria-hidden />

      <section className="phm-hero-gold">
        <p className="phm-caption">{MENU_TITLE}</p>
        <h1 className="phm-display-title phm-display-title--menu">
          {SHOP_NAME}
        </h1>
        <p className="phm-hero-lead">
          {isClientDest
            ? `${sq.officeOrder} · ${resolvedClient}`
            : `${sq.table} ${tableNumber}`}
        </p>
      </section>

      <nav className="phm-cat-rail" aria-label="Kategoritë">
        {menu.categories.map((category) => (
          <button
            key={category.name}
            type="button"
            className={`phm-cat-chip ${activeCat === category.name ? 'is-active' : ''}`}
            onClick={() => scrollToCat(category.name)}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <main className="phm-menu">
        {menu.categories.map((category) => (
          <section
            key={category.name}
            id={catId(category.name)}
            className="phm-cat-block"
          >
            <h2 className="phm-cat-heading">{category.name}</h2>
            <ul className="phm-item-list">
              {category.items.map((item) => {
                const qty = cart.getQuantity(item.name)
                return (
                  <li
                    key={item.name}
                    className={`phm-item ${qty > 0 ? 'is-in-cart' : ''}`}
                  >
                    <button
                      type="button"
                      className="phm-item-main"
                      onClick={() => cart.addItem(item)}
                    >
                      <span className="phm-item-name">{item.name}</span>
                      <span className="phm-item-price">
                        {formatEuro(item.price)}
                      </span>
                    </button>
                    <div className="phm-item-actions">
                      {qty > 0 ? (
                        <>
                          <button
                            type="button"
                            className="phm-qty"
                            aria-label={`Hiq ${item.name}`}
                            onClick={() => cart.removeItem(item.name)}
                          >
                            −
                          </button>
                          <span className="phm-qty-val">{qty}</span>
                          <button
                            type="button"
                            className="phm-qty"
                            aria-label={`Shto ${item.name}`}
                            onClick={() => cart.addItem(item)}
                          >
                            +
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="phm-add"
                          onClick={() => cart.addItem(item)}
                        >
                          + Shto
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>

      {cart.itemCount > 0 && (
        <div className="phm-sticky-cta">
          <button
            type="button"
            className={`phm-full-cta ${belowMin ? 'is-warn' : ''}`}
            onClick={() => setScreen('review')}
          >
            <span className="phm-full-cta-left">
              {sq.viewOrder}
              <em>
                {cart.itemCount}{' '}
                {cart.itemCount === 1 ? sq.itemOne : sq.items}
              </em>
            </span>
            <span className="phm-full-cta-right">
              {formatEuro(cart.total)}
              {belowMin ? ` · min €${CLIENT_MIN_ORDER_EUR}` : '  →'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
