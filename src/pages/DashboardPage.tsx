import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  fetchTodayOrders,
  isSupabaseConfigured,
  markOrderDone,
  subscribeDemoOrders,
  supabase,
} from '../lib/orders'
import { formatEuro, formatRelativeTime, formatTime } from '../utils/format'
import type { Order } from '../types'

const DASHBOARD_PIN = '1234'
const PIN_STORAGE_KEY = 'cafe-sol-dashboard-auth'

function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.setValueAtTime(1174.66, now + 0.08)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.3)

    window.setTimeout(() => void ctx.close(), 400)
  } catch {
    // Audio may be blocked until user interaction
  }
}

function OrderCard({
  order,
  onDone,
  dimmed,
}: {
  order: Order
  onDone?: (id: string) => void
  dimmed?: boolean
}) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (dimmed) return
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [dimmed])

  return (
    <article className={`order-card ${dimmed ? 'is-done' : ''}`}>
      <div className="order-card-top">
        <h2 className="order-card-table">Table {order.table_number}</h2>
        <div className="order-card-meta">
          <span className="order-card-time">
            {dimmed ? formatTime(order.created_at) : formatRelativeTime(order.created_at)}
          </span>
          <span className="order-card-total">{formatEuro(Number(order.total))}</span>
        </div>
      </div>

      <ul className="order-card-items">
        {order.items.map((item) => (
          <li key={item.name}>
            <span className="order-card-qty">{item.quantity}×</span>
            <span>{item.name}</span>
          </li>
        ))}
      </ul>

      {!dimmed && onDone && (
        <button
          type="button"
          className="btn btn-done"
          onClick={() => onDone(order.id)}
        >
          Mark Done
        </button>
      )}
    </article>
  )
}

export default function DashboardPage() {
  const [authenticated, setAuthenticated] = useState(() => {
    try {
      return sessionStorage.getItem(PIN_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const readyForSoundRef = useRef(false)

  const handlePinSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (pin === DASHBOARD_PIN) {
      try {
        sessionStorage.setItem(PIN_STORAGE_KEY, '1')
      } catch {
        // ignore
      }
      setAuthenticated(true)
      setPinError(false)
    } else {
      setPinError(true)
      setPin('')
    }
  }

  const loadOrders = useCallback(async () => {
    const { data, error: fetchError } = await fetchTodayOrders()
    if (fetchError) {
      setError(fetchError)
    } else {
      setError(null)
      setOrders(data)
      knownIdsRef.current = new Set(data.map((o) => o.id))
    }
    setLoading(false)
    // Allow sounds only after initial load settles
    window.setTimeout(() => {
      readyForSoundRef.current = true
    }, 500)
  }, [])

  useEffect(() => {
    if (!authenticated) return
    void loadOrders()
  }, [authenticated, loadOrders])

  // Demo mode: poll localStorage when another tab places an order
  useEffect(() => {
    if (!authenticated || isSupabaseConfigured) return

    const unsub = subscribeDemoOrders(() => {
      void (async () => {
        const { data } = await fetchTodayOrders()
        const prevIds = knownIdsRef.current
        const newPending = data.filter(
          (o) => o.status === 'pending' && !prevIds.has(o.id)
        )
        if (
          readyForSoundRef.current &&
          soundEnabled &&
          newPending.length > 0
        ) {
          playNotificationSound()
        }
        knownIdsRef.current = new Set(data.map((o) => o.id))
        setOrders(data)
      })()
    })

    return unsub
  }, [authenticated, soundEnabled])

  // Live mode: Supabase Realtime
  useEffect(() => {
    if (!authenticated || !supabase) return

    const client = supabase
    const channel = client
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const order = payload.new as Order
            const created = new Date(order.created_at)
            const startOfDay = new Date()
            startOfDay.setHours(0, 0, 0, 0)
            if (created < startOfDay) return

            setOrders((prev) => {
              if (prev.some((o) => o.id === order.id)) return prev
              return [order, ...prev]
            })

            if (
              readyForSoundRef.current &&
              soundEnabled &&
              !knownIdsRef.current.has(order.id)
            ) {
              playNotificationSound()
            }
            knownIdsRef.current.add(order.id)
          }

          if (payload.eventType === 'UPDATE') {
            const order = payload.new as Order
            setOrders((prev) =>
              prev.map((o) => (o.id === order.id ? order : o))
            )
          }

          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string }
            if (old.id) {
              setOrders((prev) => prev.filter((o) => o.id !== old.id))
              knownIdsRef.current.delete(old.id)
            }
          }
        }
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [authenticated, soundEnabled])

  const handleDone = async (id: string) => {
    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'done' as const } : o))
    )
    const { error: updateError } = await markOrderDone(id)
    if (updateError) {
      setError(updateError)
      void loadOrders()
    }
  }

  const pending = useMemo(
    () => orders.filter((o) => o.status === 'pending'),
    [orders]
  )
  const completed = useMemo(
    () => orders.filter((o) => o.status === 'done'),
    [orders]
  )

  const dailyRevenue = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.total), 0),
    [orders]
  )

  if (!authenticated) {
    return (
      <div className="dashboard-pin-page">
        <form className="pin-card" onSubmit={handlePinSubmit}>
          <h1>Staff access</h1>
          <p>Enter PIN to open the order board</p>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            className={`pin-input ${pinError ? 'is-error' : ''}`}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setPinError(false)
            }}
            placeholder="••••"
            maxLength={8}
            autoFocus
          />
          {pinError && <p className="form-error">Incorrect PIN</p>}
          <button type="submit" className="btn btn-primary btn-block">
            Unlock
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <h1>Orders</h1>
          <span className="pending-pill">
            {pending.length} pending
          </span>
        </div>
        <div className="dashboard-stats">
          <div className="stat">
            <span className="stat-label">Today</span>
            <span className="stat-value">{orders.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Revenue</span>
            <span className="stat-value">{formatEuro(dailyRevenue)}</span>
          </div>
          <button
            type="button"
            className={`sound-toggle ${soundEnabled ? 'is-on' : ''}`}
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? 'Mute notifications' : 'Enable sound'}
            aria-label={soundEnabled ? 'Mute notifications' : 'Enable sound'}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>
        </div>
      </header>

      {!isSupabaseConfigured && (
        <div className="banner banner-warn">
          <strong>Demo mode</strong> — orders are stored in this browser only.
          Open the customer menu in another tab to place an order. To go live,
          add Supabase keys to <code>.env</code> and run{' '}
          <code>supabase/schema.sql</code>.
        </div>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      <main className="dashboard-main">
        <section className="dashboard-section">
          <h2 className="section-label">Active</h2>
          {loading ? (
            <p className="empty-state">Loading orders…</p>
          ) : pending.length === 0 ? (
            <p className="empty-state">No pending orders. Waiting for the next one…</p>
          ) : (
            <div className="order-grid">
              {pending.map((order) => (
                <OrderCard key={order.id} order={order} onDone={handleDone} />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-section">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setShowCompleted((v) => !v)}
          >
            <h2 className="section-label">
              Completed today
              <span className="section-count">{completed.length}</span>
            </h2>
            <span className="chevron">{showCompleted ? '▾' : '▸'}</span>
          </button>
          {showCompleted &&
            (completed.length === 0 ? (
              <p className="empty-state">No completed orders yet.</p>
            ) : (
              <div className="order-grid order-grid-done">
                {completed.map((order) => (
                  <OrderCard key={order.id} order={order} dimmed />
                ))}
              </div>
            ))}
        </section>
      </main>
    </div>
  )
}
