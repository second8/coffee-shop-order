import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  buildItemSales,
  fetchOrdersSince,
  fetchTodayOrders,
  isSupabaseConfigured,
  markOrderDone,
  ordersToCsv,
  subscribeDemoOrders,
  supabase,
} from '../lib/orders'
import { formatEuro, formatRelativeTime, formatTime } from '../utils/format'
import type { Order } from '../types'

/** Staff PIN — override with VITE_DASHBOARD_PIN in .env / Vercel if you change it later. */
const DASHBOARD_PIN =
  (import.meta.env.VITE_DASHBOARD_PIN as string | undefined)?.trim() || '197951'

/** Bump this if you change the PIN so old sessions are forced to re-enter. */
const PIN_STORAGE_KEY = 'cafe-sol-dashboard-auth-v2'

type Tab = 'live' | 'sales'
type SalesRange = 'today' | '7d' | '30d' | '90d'

function rangeStart(range: SalesRange): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === 'today') return d
  if (range === '7d') {
    d.setDate(d.getDate() - 6)
    return d
  }
  if (range === '30d') {
    d.setDate(d.getDate() - 29)
    return d
  }
  d.setDate(d.getDate() - 89)
  return d
}

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

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
  const [tab, setTab] = useState<Tab>('live')
  const [salesRange, setSalesRange] = useState<SalesRange>('today')
  const [salesOrders, setSalesOrders] = useState<Order[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
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

  const handleLogout = () => {
    try {
      sessionStorage.removeItem(PIN_STORAGE_KEY)
    } catch {
      // ignore
    }
    setAuthenticated(false)
    setPin('')
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
    window.setTimeout(() => {
      readyForSoundRef.current = true
    }, 500)
  }, [])

  const loadSales = useCallback(async (range: SalesRange) => {
    setSalesLoading(true)
    const { data, error: fetchError } = await fetchOrdersSince(
      rangeStart(range).toISOString()
    )
    if (fetchError) {
      setError(fetchError)
    } else {
      setError(null)
      setSalesOrders(data)
    }
    setSalesLoading(false)
  }, [])

  useEffect(() => {
    if (!authenticated) return
    void loadOrders()
  }, [authenticated, loadOrders])

  useEffect(() => {
    if (!authenticated || tab !== 'sales') return
    void loadSales(salesRange)
  }, [authenticated, tab, salesRange, loadSales])

  // Demo mode: react when another tab places an order
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
        if (tab === 'sales') void loadSales(salesRange)
      })()
    })

    return unsub
  }, [authenticated, soundEnabled, tab, salesRange, loadSales])

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
            if (created >= startOfDay) {
              setOrders((prev) => {
                if (prev.some((o) => o.id === order.id)) return prev
                return [order, ...prev]
              })
            }

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

  const salesRevenue = useMemo(
    () => salesOrders.reduce((sum, o) => sum + Number(o.total), 0),
    [salesOrders]
  )

  const itemSales = useMemo(() => buildItemSales(salesOrders), [salesOrders])

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
              setPin(e.target.value.replace(/\D/g, ''))
              setPinError(false)
            }}
            placeholder="••••••"
            maxLength={12}
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
          <span className="pending-pill">{pending.length} pending</span>
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
          <button
            type="button"
            className="logout-btn"
            onClick={handleLogout}
            title="Lock dashboard"
          >
            Lock
          </button>
        </div>
      </header>

      <nav className="dashboard-tabs" aria-label="Dashboard sections">
        <button
          type="button"
          className={`dash-tab ${tab === 'live' ? 'is-active' : ''}`}
          onClick={() => setTab('live')}
        >
          Live board
        </button>
        <button
          type="button"
          className={`dash-tab ${tab === 'sales' ? 'is-active' : ''}`}
          onClick={() => setTab('sales')}
        >
          Sales & history
        </button>
      </nav>

      {!isSupabaseConfigured && (
        <div className="banner banner-warn">
          <strong>Demo mode</strong> — orders are stored in this browser only.
          Live data needs Supabase.
        </div>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      <main className="dashboard-main">
        {tab === 'live' && (
          <>
            <section className="dashboard-section">
              <h2 className="section-label">Active</h2>
              {loading ? (
                <p className="empty-state">Loading orders…</p>
              ) : pending.length === 0 ? (
                <p className="empty-state">
                  No pending orders. Waiting for the next one…
                </p>
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
          </>
        )}

        {tab === 'sales' && (
          <section className="dashboard-section sales-section">
            <div className="sales-toolbar">
              <div className="range-pills" role="group" aria-label="Date range">
                {(
                  [
                    ['today', 'Today'],
                    ['7d', '7 days'],
                    ['30d', '30 days'],
                    ['90d', '90 days'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`range-pill ${salesRange === key ? 'is-active' : ''}`}
                    onClick={() => setSalesRange(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={salesOrders.length === 0}
                onClick={() =>
                  downloadText(
                    `cafe-sol-orders-${salesRange}.csv`,
                    ordersToCsv(salesOrders)
                  )
                }
              >
                Download CSV
              </button>
            </div>

            <div className="sales-summary">
              <div className="sales-stat-card">
                <span className="stat-label">Orders</span>
                <span className="sales-stat-value">
                  {salesLoading ? '…' : salesOrders.length}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">Revenue</span>
                <span className="sales-stat-value">
                  {salesLoading ? '…' : formatEuro(salesRevenue)}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">Avg order</span>
                <span className="sales-stat-value">
                  {salesLoading || salesOrders.length === 0
                    ? '—'
                    : formatEuro(salesRevenue / salesOrders.length)}
                </span>
              </div>
            </div>

            <h2 className="section-label">Items sold</h2>
            {salesLoading ? (
              <p className="empty-state">Loading sales…</p>
            ) : itemSales.length === 0 ? (
              <p className="empty-state">No orders in this period.</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemSales.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>{row.quantity}</td>
                        <td>{formatEuro(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="sales-footnote">
              All orders stay in your Supabase database permanently. This screen
              only displays a range for reporting. Use Download CSV to archive
              sales offline (Excel, Google Sheets, bookkeeping).
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
