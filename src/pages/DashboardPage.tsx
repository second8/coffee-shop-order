import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  fetchStaffProfile,
  getDemoProfile,
  getSession,
  isDemoAuth,
  onAuthChange,
  signInWithEmail,
  signOut,
} from '../lib/auth'
import {
  buildItemSales,
  buildSpeedStats,
  fetchOrdersSince,
  fetchTodayOrders,
  formatDuration,
  isSupabaseConfigured,
  markOrderDone,
  ordersToCsv,
  subscribeDemoOrders,
  supabase,
} from '../lib/orders'
import { formatEuro, formatRelativeTime, formatTime } from '../utils/format'
import { sq } from '../i18n/sq'
import type { Order, StaffProfile } from '../types'

type Tab = 'live' | 'sales' | 'speed'
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
    // ignore
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
        <h2 className="order-card-table">
          {sq.table} {order.table_number}
        </h2>
        <div className="order-card-meta">
          <span className="order-card-time">
            {dimmed
              ? formatTime(order.created_at)
              : formatRelativeTime(order.created_at)}
          </span>
          <span className="order-card-total">
            {formatEuro(Number(order.total))}
          </span>
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
          {sq.markDone}
        </button>
      )}
    </article>
  )
}

export default function DashboardPage() {
  const [authLoading, setAuthLoading] = useState(true)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

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

  const isAdmin = profile?.role === 'admin'

  const applySession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    const p = await fetchStaffProfile(
      session.user.id,
      session.user.email ?? ''
    )
    setProfile(p)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (isDemoAuth()) {
        if (!cancelled) {
          setProfile(getDemoProfile())
          setAuthLoading(false)
        }
        return
      }

      const session = await getSession()
      if (!cancelled) {
        await applySession(session)
        setAuthLoading(false)
      }
    })()

    const unsub = onAuthChange((session) => {
      void applySession(session)
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [applySession])

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError(null)
    const { error: err } = await signInWithEmail(email, password)
    setLoggingIn(false)
    if (err) {
      setLoginError(err)
      return
    }
    if (isDemoAuth()) {
      setProfile(getDemoProfile())
    }
  }

  const handleLogout = async () => {
    await signOut()
    setProfile(null)
    setOrders([])
    setTab('live')
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
    if (!profile) return
    void loadOrders()
  }, [profile, loadOrders])

  useEffect(() => {
    if (!profile || !isAdmin) return
    if (tab !== 'sales' && tab !== 'speed') return
    void loadSales(salesRange)
  }, [profile, isAdmin, tab, salesRange, loadSales])

  useEffect(() => {
    if (!profile || isSupabaseConfigured) return

    const unsub = subscribeDemoOrders(() => {
      void (async () => {
        const { data } = await fetchTodayOrders()
        const prevIds = knownIdsRef.current
        const newPending = data.filter(
          (o) => o.status === 'pending' && !prevIds.has(o.id)
        )
        if (readyForSoundRef.current && soundEnabled && newPending.length > 0) {
          playNotificationSound()
        }
        knownIdsRef.current = new Set(data.map((o) => o.id))
        setOrders(data)
        if (isAdmin && (tab === 'sales' || tab === 'speed')) {
          void loadSales(salesRange)
        }
      })()
    })

    return unsub
  }, [profile, soundEnabled, isAdmin, tab, salesRange, loadSales])

  useEffect(() => {
    if (!profile || !supabase) return

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
  }, [profile, soundEnabled])

  const handleDone = async (id: string) => {
    const now = new Date().toISOString()
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status: 'done' as const,
              completed_at: now,
              completed_by: profile?.id ?? null,
            }
          : o
      )
    )
    const { error: updateError } = await markOrderDone(id, profile?.id)
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
  const speedStats = useMemo(() => buildSpeedStats(salesOrders), [salesOrders])

  if (authLoading) {
    return (
      <div className="dashboard-pin-page">
        <p style={{ color: '#a89888' }}>{sq.loading}</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="dashboard-pin-page">
        <form className="pin-card login-card" onSubmit={handleLogin}>
          <h1>{sq.staffAccess}</h1>
          <p>{sq.staffHint}</p>
          <label className="field-label" htmlFor="email">
            {sq.email}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className="text-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <label className="field-label" htmlFor="password">
            {sq.password}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="text-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {loginError && <p className="form-error">{loginError}</p>}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loggingIn}
          >
            {loggingIn ? sq.signingIn : sq.signIn}
          </button>
          <p className="login-help">{sq.needAccount}</p>
          {isDemoAuth() && (
            <p className="login-help">
              Demo: admin@demo.local / admin · worker@demo.local / worker
            </p>
          )}
        </form>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <h1>{sq.orders}</h1>
          <span className="pending-pill">
            {pending.length} {sq.pending}
          </span>
          <span className={`role-pill role-${profile.role}`}>
            {profile.role === 'admin' ? sq.roleAdmin : sq.roleWorker}
          </span>
        </div>
        <div className="dashboard-stats">
          {isAdmin && (
            <>
              <div className="stat">
                <span className="stat-label">{sq.today}</span>
                <span className="stat-value">{orders.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">{sq.revenue}</span>
                <span className="stat-value">{formatEuro(dailyRevenue)}</span>
              </div>
            </>
          )}
          <button
            type="button"
            className={`sound-toggle ${soundEnabled ? 'is-on' : ''}`}
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? sq.soundOn : sq.soundOff}
            aria-label={soundEnabled ? sq.soundOn : sq.soundOff}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            {sq.signOut}
          </button>
        </div>
      </header>

      <nav className="dashboard-tabs" aria-label="Seksionet">
        <button
          type="button"
          className={`dash-tab ${tab === 'live' ? 'is-active' : ''}`}
          onClick={() => setTab('live')}
        >
          {sq.liveBoard}
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              className={`dash-tab ${tab === 'sales' ? 'is-active' : ''}`}
              onClick={() => setTab('sales')}
            >
              {sq.salesHistory}
            </button>
            <button
              type="button"
              className={`dash-tab ${tab === 'speed' ? 'is-active' : ''}`}
              onClick={() => setTab('speed')}
            >
              {sq.performance}
            </button>
          </>
        )}
      </nav>

      {!isSupabaseConfigured && (
        <div className="banner banner-warn">
          <strong>Demo</strong> — {sq.demoBanner}
        </div>
      )}

      {!isAdmin && (
        <div className="banner banner-info">{sq.onlyAdmin}</div>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      <main className="dashboard-main">
        {tab === 'live' && (
          <>
            <section className="dashboard-section">
              <h2 className="section-label">{sq.active}</h2>
              {loading ? (
                <p className="empty-state">{sq.loading}</p>
              ) : pending.length === 0 ? (
                <p className="empty-state">{sq.noPending}</p>
              ) : (
                <div className="order-grid">
                  {pending.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onDone={handleDone}
                    />
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
                  {sq.completedToday}
                  <span className="section-count">{completed.length}</span>
                </h2>
                <span className="chevron">{showCompleted ? '▾' : '▸'}</span>
              </button>
              {showCompleted &&
                (completed.length === 0 ? (
                  <p className="empty-state">{sq.noCompleted}</p>
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

        {tab === 'sales' && isAdmin && (
          <section className="dashboard-section sales-section">
            <div className="sales-toolbar">
              <div className="range-pills" role="group">
                {(
                  [
                    ['today', sq.rangeToday],
                    ['7d', sq.range7],
                    ['30d', sq.range30],
                    ['90d', sq.range90],
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
                    `porosi-${salesRange}.csv`,
                    ordersToCsv(salesOrders)
                  )
                }
              >
                {sq.downloadCsv}
              </button>
            </div>

            <div className="sales-summary">
              <div className="sales-stat-card">
                <span className="stat-label">{sq.orderCount}</span>
                <span className="sales-stat-value">
                  {salesLoading ? '…' : salesOrders.length}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">{sq.revenue}</span>
                <span className="sales-stat-value">
                  {salesLoading ? '…' : formatEuro(salesRevenue)}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">{sq.avgOrder}</span>
                <span className="sales-stat-value">
                  {salesLoading || salesOrders.length === 0
                    ? '—'
                    : formatEuro(salesRevenue / salesOrders.length)}
                </span>
              </div>
            </div>

            <h2 className="section-label">{sq.itemsSold}</h2>
            {salesLoading ? (
              <p className="empty-state">{sq.loading}</p>
            ) : itemSales.length === 0 ? (
              <p className="empty-state">{sq.noSales}</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>{sq.itemCol}</th>
                      <th>{sq.qty}</th>
                      <th>{sq.rev}</th>
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
            <p className="sales-footnote">{sq.salesFootnote}</p>
          </section>
        )}

        {tab === 'speed' && isAdmin && (
          <section className="dashboard-section sales-section">
            <div className="sales-toolbar">
              <div className="range-pills" role="group">
                {(
                  [
                    ['today', sq.rangeToday],
                    ['7d', sq.range7],
                    ['30d', sq.range30],
                    ['90d', sq.range90],
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
            </div>

            <div className="sales-summary">
              <div className="sales-stat-card">
                <span className="stat-label">{sq.avgSpeed}</span>
                <span className="sales-stat-value">
                  {speedStats.avgSeconds === null
                    ? '—'
                    : formatDuration(Math.round(speedStats.avgSeconds))}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">{sq.medianSpeed}</span>
                <span className="sales-stat-value">
                  {speedStats.medianSeconds === null
                    ? '—'
                    : formatDuration(Math.round(speedStats.medianSeconds))}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">{sq.under5}</span>
                <span className="sales-stat-value">
                  {speedStats.count === 0
                    ? '—'
                    : `${Math.round((speedStats.under5min / speedStats.count) * 100)}%`}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">{sq.under10}</span>
                <span className="sales-stat-value">
                  {speedStats.count === 0
                    ? '—'
                    : `${Math.round((speedStats.under10min / speedStats.count) * 100)}%`}
                </span>
              </div>
            </div>

            <h2 className="section-label">{sq.completionList}</h2>
            {salesLoading ? (
              <p className="empty-state">{sq.loading}</p>
            ) : speedStats.samples.length === 0 ? (
              <p className="empty-state">{sq.noSpeedData}</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>{sq.table}</th>
                      <th>{sq.duration}</th>
                      <th>{sq.total}</th>
                      <th>Ora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {speedStats.samples.slice(0, 50).map(({ order, seconds }) => (
                      <tr key={order.id}>
                        <td>
                          {sq.table} {order.table_number}
                        </td>
                        <td>{formatDuration(seconds)}</td>
                        <td>{formatEuro(Number(order.total))}</td>
                        <td>{formatTime(order.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
