import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  fetchStaffProfile,
  getDemoProfile,
  getSession,
  isDemoAuth,
  onAuthChange,
  refreshSession,
  signInWithEmail,
  signOut,
} from '../lib/auth'
import {
  archiveOrder,
  buildItemSales,
  buildPeakHours,
  buildSpeedStats,
  buildTableStats,
  buildWorkerStats,
  cancelOrder,
  deleteOrderForever,
  fetchArchivedOrders,
  fetchOrdersSince,
  fetchStaffNameMap,
  fetchStaffSessions,
  fetchTodayOrders,
  formatDuration,
  isActiveOrder,
  isSupabaseConfigured,
  markOrderDone,
  ordersToCsv,
  purgeOldArchives,
  restoreOrder,
  sessionDurationSeconds,
  subscribeDemoOrders,
  supabase,
} from '../lib/orders'
import { formatEuro, formatRelativeTime, formatTime } from '../utils/format'
import { sq } from '../i18n/sq'
import type { Order, StaffProfile, StaffSession } from '../types'

type Tab = 'live' | 'sales' | 'speed' | 'team' | 'archive'
type SalesRange = 'today' | '7d' | '30d' | '90d'

function rangeStart(range: SalesRange): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === 'today') return d
  if (range === '7d') d.setDate(d.getDate() - 6)
  else if (range === '30d') d.setDate(d.getDate() - 29)
  else d.setDate(d.getDate() - 89)
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
  staffName,
  onDone,
  onCancel,
  onArchive,
  onRestore,
  onDelete,
  variant,
}: {
  order: Order
  staffName?: string
  onDone?: (id: string) => void
  onCancel?: (id: string) => void
  onArchive?: (id: string) => void
  onRestore?: (id: string) => void
  onDelete?: (id: string) => void
  variant: 'pending' | 'done' | 'cancelled' | 'archive'
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (variant !== 'pending') return
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [variant])

  return (
    <article
      className={`order-card ${variant === 'pending' ? '' : 'is-done'} ${variant === 'cancelled' ? 'is-cancelled' : ''} ${variant === 'archive' ? 'is-archive' : ''}`}
    >
      <div className="order-card-top">
        <h2 className="order-card-table">
          {sq.table} {order.table_number}
        </h2>
        <div className="order-card-meta">
          <span className="order-card-time">
            {variant === 'pending'
              ? formatRelativeTime(order.created_at)
              : formatTime(order.completed_at || order.created_at)}
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

      {staffName && variant !== 'pending' && (
        <p className="order-card-by">
          {sq.by} <strong>{staffName}</strong>
        </p>
      )}

      <div className="order-card-actions">
        {variant === 'pending' && onDone && (
          <button type="button" className="btn btn-done" onClick={() => onDone(order.id)}>
            {sq.markDone}
          </button>
        )}
        {variant === 'pending' && onCancel && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (window.confirm(sq.confirmCancel)) onCancel(order.id)
            }}
          >
            {sq.cancel}
          </button>
        )}
        {(variant === 'done' || variant === 'cancelled') && onArchive && (
          <button type="button" className="btn btn-ghost" onClick={() => onArchive(order.id)}>
            {sq.archive}
          </button>
        )}
        {variant === 'archive' && onRestore && (
          <button type="button" className="btn btn-ghost" onClick={() => onRestore(order.id)}>
            {sq.restore}
          </button>
        )}
        {variant === 'archive' && onDelete && (
          <button
            type="button"
            className="btn btn-danger-ghost"
            onClick={() => {
              if (window.confirm(sq.confirmDelete)) onDelete(order.id)
            }}
          >
            {sq.deleteForever}
          </button>
        )}
      </div>
    </article>
  )
}

function RangePills({
  value,
  onChange,
}: {
  value: SalesRange
  onChange: (v: SalesRange) => void
}) {
  return (
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
          className={`range-pill ${value === key ? 'is-active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
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
  const [archive, setArchive] = useState<Order[]>([])
  const [sessions, setSessions] = useState<StaffSession[]>([])
  const [nameMap, setNameMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(true)
  const [showCancelled, setShowCancelled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [tab, setTab] = useState<Tab>('live')
  const [salesRange, setSalesRange] = useState<SalesRange>('today')
  const [salesOrders, setSalesOrders] = useState<Order[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const readyForSoundRef = useRef(false)

  const isAdmin = profile?.role === 'admin'

  const staffLabel = useCallback(
    (id?: string | null) => {
      if (!id) return undefined
      return nameMap[id] || sq.unknownStaff
    },
    [nameMap]
  )

  const applySession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    const p = await fetchStaffProfile(session.user)
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
      let session = await refreshSession()
      if (!session) session = await getSession()
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
    if (err) {
      setLoggingIn(false)
      setLoginError(err)
      return
    }
    if (isDemoAuth()) {
      setProfile(getDemoProfile())
      setLoggingIn(false)
      return
    }
    const session = await refreshSession()
    await applySession(session)
    setLoggingIn(false)
  }

  const handleLogout = async () => {
    await signOut()
    setProfile(null)
    setOrders([])
    setTab('live')
  }

  const loadOrders = useCallback(async () => {
    const { data, error: fetchError } = await fetchTodayOrders()
    if (fetchError) setError(fetchError)
    else {
      setError(null)
      setOrders(data)
      knownIdsRef.current = new Set(data.map((o) => o.id))
    }
    setLoading(false)
    window.setTimeout(() => {
      readyForSoundRef.current = true
    }, 500)
  }, [])

  const loadNames = useCallback(async () => {
    const map = await fetchStaffNameMap()
    if (profile) {
      map[profile.id] = profile.display_name || profile.email.split('@')[0] || profile.id
    }
    setNameMap(map)
  }, [profile])

  const loadSales = useCallback(async (range: SalesRange) => {
    setSalesLoading(true)
    const since = rangeStart(range).toISOString()
    const [{ data, error: fetchError }, sessionsRes] = await Promise.all([
      fetchOrdersSince(since),
      fetchStaffSessions(since),
    ])
    if (fetchError) setError(fetchError)
    else {
      setError(null)
      setSalesOrders(data)
    }
    if (!sessionsRes.error) setSessions(sessionsRes.data)
    setSalesLoading(false)
  }, [])

  const loadArchive = useCallback(async () => {
    await purgeOldArchives()
    const { data, error: err } = await fetchArchivedOrders()
    if (err) setError(err)
    else setArchive(data)
  }, [])

  useEffect(() => {
    if (!profile) return
    void loadOrders()
    void loadNames()
  }, [profile, loadOrders, loadNames])

  useEffect(() => {
    if (!profile || !isAdmin) return
    if (tab === 'sales' || tab === 'speed' || tab === 'team') {
      void loadSales(salesRange)
    }
    if (tab === 'archive') void loadArchive()
  }, [profile, isAdmin, tab, salesRange, loadSales, loadArchive])

  useEffect(() => {
    if (!profile || isSupabaseConfigured) return
    return subscribeDemoOrders(() => {
      void loadOrders()
      if (isAdmin && (tab === 'sales' || tab === 'speed' || tab === 'team')) {
        void loadSales(salesRange)
      }
      if (isAdmin && tab === 'archive') void loadArchive()
    })
  }, [profile, isAdmin, tab, salesRange, loadOrders, loadSales, loadArchive])

  useEffect(() => {
    if (!profile || !supabase) return
    const client = supabase
    const channel = client
      .channel('orders-realtime-v2')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const order = payload.new as Order
            const start = new Date()
            start.setHours(0, 0, 0, 0)
            if (new Date(order.created_at) >= start && !order.archived_at) {
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
            setOrders((prev) => {
              if (order.archived_at) return prev.filter((o) => o.id !== order.id)
              const exists = prev.some((o) => o.id === order.id)
              if (!exists) return [order, ...prev]
              return prev.map((o) => (o.id === order.id ? order : o))
            })
            setArchive((prev) => {
              if (order.archived_at) {
                const exists = prev.some((o) => o.id === order.id)
                return exists
                  ? prev.map((o) => (o.id === order.id ? order : o))
                  : [order, ...prev]
              }
              return prev.filter((o) => o.id !== order.id)
            })
          }
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string }
            if (old.id) {
              setOrders((prev) => prev.filter((o) => o.id !== old.id))
              setArchive((prev) => prev.filter((o) => o.id !== old.id))
            }
          }
        }
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [profile, soundEnabled])

  const patchLocal = (id: string, patch: Partial<Order>) => {
    setOrders((prev) =>
      prev
        .map((o) => (o.id === id ? { ...o, ...patch } : o))
        .filter((o) => !o.archived_at)
    )
  }

  const handleDone = async (id: string) => {
    const now = new Date().toISOString()
    patchLocal(id, {
      status: 'done',
      completed_at: now,
      completed_by: profile?.id ?? null,
    })
    const { error: err } = await markOrderDone(id, profile?.id)
    if (err) {
      setError(err)
      void loadOrders()
    }
  }

  const handleCancel = async (id: string) => {
    const now = new Date().toISOString()
    patchLocal(id, {
      status: 'cancelled',
      completed_at: now,
      completed_by: profile?.id ?? null,
    })
    const { error: err } = await cancelOrder(id, profile?.id)
    if (err) {
      setError(err + ' — ' + sq.migrationHint)
      void loadOrders()
    }
  }

  const handleArchive = async (id: string) => {
    const now = new Date().toISOString()
    const order = orders.find((o) => o.id === id)
    setOrders((prev) => prev.filter((o) => o.id !== id))
    if (order) setArchive((prev) => [{ ...order, archived_at: now }, ...prev])
    const { error: err } = await archiveOrder(id)
    if (err) {
      setError(err + ' — ' + sq.migrationHint)
      void loadOrders()
    }
  }

  const handleRestore = async (id: string) => {
    const order = archive.find((o) => o.id === id)
    setArchive((prev) => prev.filter((o) => o.id !== id))
    if (order) setOrders((prev) => [{ ...order, archived_at: null }, ...prev])
    const { error: err } = await restoreOrder(id)
    if (err) {
      setError(err)
      void loadArchive()
      void loadOrders()
    }
  }

  const handleDelete = async (id: string) => {
    setArchive((prev) => prev.filter((o) => o.id !== id))
    const { error: err } = await deleteOrderForever(id)
    if (err) {
      setError(err)
      void loadArchive()
    }
  }

  const handlePurge = async () => {
    const { removed, error: err } = await purgeOldArchives()
    if (err) setError(err)
    else {
      void loadArchive()
      if (removed > 0) setError(null)
    }
  }

  const activeOrders = useMemo(() => orders.filter(isActiveOrder), [orders])

  const pending = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'pending')
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [activeOrders]
  )

  const completed = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'done')
        .sort(
          (a, b) =>
            new Date(b.completed_at || b.created_at).getTime() -
            new Date(a.completed_at || a.created_at).getTime()
        ),
    [activeOrders]
  )

  const cancelled = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'cancelled')
        .sort(
          (a, b) =>
            new Date(b.completed_at || b.created_at).getTime() -
            new Date(a.completed_at || a.created_at).getTime()
        ),
    [activeOrders]
  )

  const dailyRevenue = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'done')
        .reduce((sum, o) => sum + Number(o.total), 0),
    [activeOrders]
  )

  const statsPool = salesOrders
  const salesRevenue = useMemo(
    () =>
      statsPool
        .filter((o) => o.status === 'done')
        .reduce((sum, o) => sum + Number(o.total), 0),
    [statsPool]
  )
  const doneCount = useMemo(
    () => statsPool.filter((o) => o.status === 'done').length,
    [statsPool]
  )
  const itemSales = useMemo(() => buildItemSales(statsPool), [statsPool])
  const speedStats = useMemo(() => buildSpeedStats(statsPool), [statsPool])
  const tableStats = useMemo(() => buildTableStats(statsPool), [statsPool])
  const workerStats = useMemo(
    () => buildWorkerStats(statsPool, nameMap),
    [statsPool, nameMap]
  )
  const peakHours = useMemo(() => buildPeakHours(statsPool), [statsPool])

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
          <button type="submit" className="btn btn-primary btn-block" disabled={loggingIn}>
            {loggingIn ? sq.signingIn : sq.signIn}
          </button>
          <p className="login-help">{sq.needAccount}</p>
        </form>
      </div>
    )
  }

  return (
    <div
      className={`dashboard-page ${isAdmin ? 'theme-admin' : 'theme-worker'}`}
    >
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <h1>{sq.orders}</h1>
          <span className="pending-pill">
            {pending.length} {sq.pending}
          </span>
          <span className={`role-pill role-${profile.role}`}>
            {profile.display_name ||
              profile.email.split('@')[0] ||
              (profile.role === 'admin' ? sq.roleAdmin : sq.roleWorker)}
          </span>
        </div>
        <div className="dashboard-stats">
          {isAdmin && (
            <>
              <div className="stat">
                <span className="stat-label">{sq.today}</span>
                <span className="stat-value">
                  {activeOrders.filter((o) => o.status === 'done').length}
                </span>
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
            aria-label={soundEnabled ? sq.soundOn : sq.soundOff}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            {sq.signOut}
          </button>
        </div>
      </header>

      {/* Workers only have the live board — hide tab bar. Admin sees all sections. */}
      {isAdmin && (
        <nav className="dashboard-tabs">
          <button
            type="button"
            className={`dash-tab ${tab === 'live' ? 'is-active' : ''}`}
            onClick={() => setTab('live')}
          >
            {sq.liveBoard}
          </button>
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
          <button
            type="button"
            className={`dash-tab ${tab === 'team' ? 'is-active' : ''}`}
            onClick={() => setTab('team')}
          >
            {sq.team}
          </button>
          <button
            type="button"
            className={`dash-tab ${tab === 'archive' ? 'is-active' : ''}`}
            onClick={() => setTab('archive')}
          >
            {sq.archiveTab}
          </button>
        </nav>
      )}

      {!isSupabaseConfigured && (
        <div className="banner banner-warn">
          <strong>Demo</strong> — {sq.demoBanner}
        </div>
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
                      variant="pending"
                      onDone={handleDone}
                      onCancel={handleCancel}
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
                  <div className="order-list">
                    {completed.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        variant="done"
                        staffName={staffLabel(order.completed_by)}
                        onArchive={isAdmin ? handleArchive : undefined}
                      />
                    ))}
                  </div>
                ))}
            </section>

            <section className="dashboard-section">
              <button
                type="button"
                className="section-toggle"
                onClick={() => setShowCancelled((v) => !v)}
              >
                <h2 className="section-label">
                  {sq.cancelledToday}
                  <span className="section-count">{cancelled.length}</span>
                </h2>
                <span className="chevron">{showCancelled ? '▾' : '▸'}</span>
              </button>
              {showCancelled &&
                (cancelled.length === 0 ? (
                  <p className="empty-state">{sq.noCancelled}</p>
                ) : (
                  <div className="order-list">
                    {cancelled.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        variant="cancelled"
                        staffName={staffLabel(order.completed_by)}
                        onArchive={isAdmin ? handleArchive : undefined}
                      />
                    ))}
                  </div>
                ))}
            </section>
          </>
        )}

        {tab === 'sales' && isAdmin && (
          <section className="dashboard-section sales-section">
            <div className="sales-toolbar">
              <RangePills value={salesRange} onChange={setSalesRange} />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={statsPool.length === 0}
                onClick={() =>
                  downloadText(`porosi-${salesRange}.csv`, ordersToCsv(statsPool))
                }
              >
                {sq.downloadCsv}
              </button>
            </div>
            <div className="sales-summary">
              <div className="sales-stat-card">
                <span className="stat-label">{sq.orderCount}</span>
                <span className="sales-stat-value">
                  {salesLoading ? '…' : doneCount}
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
                  {salesLoading || doneCount === 0
                    ? '—'
                    : formatEuro(salesRevenue / doneCount)}
                </span>
              </div>
            </div>

            <h2 className="section-label">{sq.tableStats}</h2>
            {tableStats.length === 0 ? (
              <p className="empty-state">{sq.noSales}</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>{sq.table}</th>
                      <th>{sq.orderCount}</th>
                      <th>{sq.rev}</th>
                      <th>{sq.cancelled}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableStats.map((row) => (
                      <tr key={row.table}>
                        <td>
                          {sq.table} {row.table}
                        </td>
                        <td>{row.orders}</td>
                        <td>{formatEuro(row.revenue)}</td>
                        <td>{row.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="section-label">{sq.peakHours}</h2>
            {peakHours.length === 0 ? (
              <p className="empty-state">{sq.noSales}</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>{sq.hour}</th>
                      <th>{sq.count}</th>
                      <th>{sq.rev}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peakHours.slice(0, 8).map((row) => (
                      <tr key={row.hour}>
                        <td>
                          {String(row.hour).padStart(2, '0')}:00
                        </td>
                        <td>{row.count}</td>
                        <td>{formatEuro(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="section-label">{sq.itemsSold}</h2>
            {itemSales.length === 0 ? (
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
              <RangePills value={salesRange} onChange={setSalesRange} />
            </div>
            <div className="sales-summary">
              <div className="sales-stat-card">
                <span className="stat-label">{sq.avgSpeed}</span>
                <span className="sales-stat-value">
                  {speedStats.avgSeconds == null
                    ? '—'
                    : formatDuration(Math.round(speedStats.avgSeconds))}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">{sq.medianSpeed}</span>
                <span className="sales-stat-value">
                  {speedStats.medianSeconds == null
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
            </div>
            <h2 className="section-label">{sq.completionList}</h2>
            {speedStats.samples.length === 0 ? (
              <p className="empty-state">{sq.noSpeedData}</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>{sq.table}</th>
                      <th>{sq.duration}</th>
                      <th>{sq.by}</th>
                      <th>{sq.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {speedStats.samples.slice(0, 40).map(({ order, seconds }) => (
                      <tr key={order.id}>
                        <td>
                          {sq.table} {order.table_number}
                        </td>
                        <td>{formatDuration(seconds)}</td>
                        <td>{staffLabel(order.completed_by) || '—'}</td>
                        <td>{formatEuro(Number(order.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'team' && isAdmin && (
          <section className="dashboard-section sales-section">
            <div className="sales-toolbar">
              <RangePills value={salesRange} onChange={setSalesRange} />
            </div>

            <h2 className="section-label">{sq.workerStats}</h2>
            {workerStats.length === 0 ? (
              <p className="empty-state">{sq.noSales}</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>{sq.by}</th>
                      <th>{sq.finished}</th>
                      <th>{sq.cancelled}</th>
                      <th>{sq.avgTime}</th>
                      <th>{sq.rev}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workerStats.map((w) => (
                      <tr key={w.userId}>
                        <td>{w.name}</td>
                        <td>{w.done}</td>
                        <td>{w.cancelled}</td>
                        <td>
                          {w.avgSeconds == null
                            ? '—'
                            : formatDuration(Math.round(w.avgSeconds))}
                        </td>
                        <td>{formatEuro(w.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="section-label">{sq.sessions}</h2>
            {sessions.length === 0 ? (
              <p className="empty-state">{sq.noSessions}</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>{sq.by}</th>
                      <th>{sq.loggedIn}</th>
                      <th>{sq.loggedOut}</th>
                      <th>{sq.duration}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => {
                      const secs = sessionDurationSeconds(s)
                      return (
                        <tr key={s.id}>
                          <td>
                            {s.display_name ||
                              nameMap[s.user_id] ||
                              s.user_id.slice(0, 8)}
                          </td>
                          <td>
                            {formatTime(s.started_at)}{' '}
                            <span className="muted-date">
                              {new Date(s.started_at).toLocaleDateString()}
                            </span>
                          </td>
                          <td>
                            {s.ended_at ? formatTime(s.ended_at) : sq.stillActive}
                          </td>
                          <td>{secs == null ? '—' : formatDuration(secs)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="sales-footnote">{sq.migrationHint}</p>
          </section>
        )}

        {tab === 'archive' && isAdmin && (
          <section className="dashboard-section sales-section">
            <div className="sales-toolbar">
              <p className="archive-lead">{sq.archiveHint}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handlePurge}>
                {sq.purgeWeek}
              </button>
            </div>
            {archive.length === 0 ? (
              <p className="empty-state">{sq.archiveEmpty}</p>
            ) : (
              <div className="order-list">
                {archive.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    variant="archive"
                    staffName={staffLabel(order.completed_by)}
                    onRestore={handleRestore}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
