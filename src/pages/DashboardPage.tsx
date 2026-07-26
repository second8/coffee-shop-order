import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ensureStaffSession,
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
  cancelOrder,
  createOrder,
  deleteOrderForever,
  fetchArchivedOrders,
  fetchOrdersSince,
  fetchStaffNameMap,
  fetchStaffProfiles,
  fetchStaffSessions,
  fetchTodayOrders,
  formatDuration,
  isActiveOrder,
  isSupabaseConfigured,
  markOrderDone,
  mergeWorkerRoster,
  ordersByWorker,
  ordersToCsv,
  purgeOldArchives,
  restoreOrder,
  sessionDurationSeconds,
  subscribeDemoOrders,
  supabase,
} from '../lib/orders'
import { menu } from '../data/menu'
import { TABLE_COUNT } from '../data/config'
import {
  formatEuro,
  formatRelativeTime,
  formatTime,
  waitMinutes,
  waitPriority,
} from '../utils/format'
import { sq } from '../i18n/sq'
import type { CartItem, Order, StaffProfile, StaffSession } from '../types'

type Tab = 'live' | 'sales' | 'speed' | 'team' | 'archive'
type SalesRange = 'today' | '7d' | '30d' | '90d'

const PREVIEW_LIMIT = 5

function rangeStart(range: SalesRange): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === 'today') return d
  if (range === '7d') d.setDate(d.getDate() - 6)
  else if (range === '30d') d.setDate(d.getDate() - 29)
  else d.setDate(d.getDate() - 89)
  return d
}

/** Louder multi-beep so kitchen hears new orders. */
function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    const playTone = (start: number, freq: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + dur + 0.02)
    }
    playTone(now, 880, 0.18)
    playTone(now + 0.2, 1174.66, 0.22)
    playTone(now + 0.48, 1318.5, 0.28)
    window.setTimeout(() => void ctx.close(), 900)
  } catch {
    // ignore
  }
  try {
    if (navigator.vibrate) navigator.vibrate([80, 40, 80])
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

function useShowMore<T>(items: T[], limit = PREVIEW_LIMIT) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, limit)
  const toggle =
    items.length > limit ? (
      <button
        type="button"
        className="btn btn-ghost show-more-btn"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? sq.showLess : `${sq.showMore} (${items.length - limit})`}
      </button>
    ) : null
  return { visible, toggle, expanded }
}

function ShowMoreBlock<T>({
  items,
  limit = PREVIEW_LIMIT,
  render,
}: {
  items: T[]
  limit?: number
  render: (item: T, index: number) => ReactNode
}) {
  const { visible, toggle } = useShowMore(items, limit)
  if (items.length === 0) return null
  return (
    <>
      {visible.map(render)}
      {toggle}
    </>
  )
}

function ShowMoreTableBody<T>({
  items,
  limit = PREVIEW_LIMIT,
  colSpan,
  renderRow,
}: {
  items: T[]
  limit?: number
  colSpan: number
  renderRow: (item: T, index: number) => ReactNode
}) {
  const { visible, toggle } = useShowMore(items, limit)
  return (
    <>
      {visible.map(renderRow)}
      {toggle && (
        <tr className="show-more-row">
          <td colSpan={colSpan}>{toggle}</td>
        </tr>
      )}
    </>
  )
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
  showDetails,
}: {
  order: Order
  staffName?: string
  onDone?: (id: string) => void
  onCancel?: (id: string) => void
  onArchive?: (id: string) => void
  onRestore?: (id: string) => void
  onDelete?: (id: string) => void
  variant: 'pending' | 'done' | 'cancelled' | 'archive'
  showDetails?: boolean
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (variant !== 'pending') return
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [variant])

  const mins = waitMinutes(order.created_at)
  const priority = waitPriority(mins)
  const details = showDetails ?? true

  return (
    <article
      className={[
        'order-card',
        variant === 'pending' ? '' : 'is-done',
        variant === 'cancelled' ? 'is-cancelled' : '',
        variant === 'archive' ? 'is-archive' : '',
        variant === 'pending' ? `priority-${priority}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="order-card-top">
        <div>
          <h2 className="order-card-table">
            {sq.table} {order.table_number}
          </h2>
          {variant === 'pending' && (
            <span className={`wait-badge wait-${priority}`}>
              {mins === 0
                ? formatRelativeTime(order.created_at)
                : `${mins} min · ${sq.waiting}`}
              {priority === 'critical' && ` · ${sq.priorityCritical}`}
              {priority === 'hot' && ` · ${sq.priorityHot}`}
              {priority === 'warm' && ` · ${sq.priorityWarm}`}
            </span>
          )}
        </div>
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

      {details && (
        <ul className="order-card-items">
          {order.items.map((item) => (
            <li key={item.name}>
              <span className="order-card-qty">{item.quantity}×</span>
              <span>{item.name}</span>
            </li>
          ))}
        </ul>
      )}

      {order.note && (
        <p className="order-card-note">
          <span className="order-card-note-label">{sq.noteLabel}</span>
          {order.note}
        </p>
      )}

      {staffName && variant !== 'pending' && (
        <p className="order-card-by">
          {sq.by} <strong>{staffName}</strong>
        </p>
      )}

      <div className="order-card-actions">
        {variant === 'pending' && onDone && (
          <button
            type="button"
            className="btn btn-done"
            onClick={() => onDone(order.id)}
          >
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onArchive(order.id)}
          >
            {sq.archive}
          </button>
        )}
        {variant === 'archive' && onRestore && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onRestore(order.id)}
          >
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

function ManualOrderModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (order: Order) => void
}) {
  const [table, setTable] = useState(1)
  const [lines, setLines] = useState<CartItem[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [step, setStep] = useState<'table' | 'items'>('table')

  useEffect(() => {
    if (!open) {
      setLines([])
      setNote('')
      setErr(null)
      setTable(1)
      setStep('table')
      setSubmitting(false)
    }
  }, [open])

  if (!open) return null

  const addItem = (name: string, price: number) => {
    setLines((prev) => {
      const existing = prev.find((i) => i.name === name)
      if (existing) {
        return prev.map((i) =>
          i.name === name ? { ...i, quantity: Math.min(20, i.quantity + 1) } : i
        )
      }
      return [...prev, { name, price, quantity: 1 }]
    })
  }

  const decItem = (name: string) => {
    setLines((prev) =>
      prev
        .map((i) =>
          i.name === name ? { ...i, quantity: i.quantity - 1 } : i
        )
        .filter((i) => i.quantity > 0)
    )
  }

  const total = lines.reduce((s, i) => s + i.price * i.quantity, 0)
  const itemCount = lines.reduce((s, i) => s + i.quantity, 0)

  const submit = async () => {
    if (lines.length === 0 || submitting) return
    setSubmitting(true)
    setErr(null)
    // Staff-only path: one DB insert (never API + client = 2 orders)
    const { data, error } = await createOrder(table, lines, total, note, {
      mode: 'staff',
    })
    setSubmitting(false)
    if (error) {
      setErr(error)
      return
    }
    if (data) onCreated(data)
    onClose()
  }

  return (
    <div className="manual-sheet-backdrop" role="presentation">
      <div
        className="manual-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-order-title"
      >
        <header className="manual-sheet-header">
          <div>
            <p className="manual-sheet-kicker">{sq.manualOrder}</p>
            <h2 id="manual-order-title">{sq.manualOrderTitle}</h2>
          </div>
          <button
            type="button"
            className="manual-close-btn"
            onClick={onClose}
            aria-label={sq.close}
          >
            ✕
          </button>
        </header>

        <div className="manual-steps">
          <button
            type="button"
            className={`manual-step ${step === 'table' ? 'is-active' : ''}`}
            onClick={() => setStep('table')}
          >
            1. {sq.selectTable}
          </button>
          <button
            type="button"
            className={`manual-step ${step === 'items' ? 'is-active' : ''}`}
            onClick={() => setStep('items')}
          >
            2. {sq.selectItems}
          </button>
        </div>

        <div className="manual-sheet-body">
          {step === 'table' && (
            <div className="manual-table-step">
              <p className="manual-help">
                {sq.table} {table}
              </p>
              <div className="table-chip-grid">
                {Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map(
                  (n) => (
                    <button
                      key={n}
                      type="button"
                      className={`table-chip ${table === n ? 'is-selected' : ''}`}
                      onClick={() => {
                        setTable(n)
                        setStep('items')
                      }}
                    >
                      {n}
                    </button>
                  )
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg manual-next-btn"
                onClick={() => setStep('items')}
              >
                {sq.selectItems} →
              </button>
            </div>
          )}

          {step === 'items' && (
            <div className="manual-items-step">
              <div className="manual-selected-table">
                <span>
                  {sq.table} <strong>{table}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setStep('table')}
                >
                  Ndrysho
                </button>
              </div>

              <div className="manual-menu">
                {menu.categories.map((cat) => (
                  <div key={cat.name} className="manual-menu-cat">
                    <h3>{cat.name}</h3>
                    <ul>
                      {cat.items.map((item) => {
                        const qty =
                          lines.find((l) => l.name === item.name)?.quantity ??
                          0
                        return (
                          <li
                            key={item.name}
                            className={qty > 0 ? 'is-picked' : ''}
                          >
                            <button
                              type="button"
                              className="manual-item-main"
                              onClick={() => addItem(item.name, item.price)}
                            >
                              <span className="manual-item-name">
                                {item.name}
                              </span>
                              <span className="manual-item-price">
                                {formatEuro(item.price)}
                              </span>
                            </button>
                            <div className="qty-controls qty-controls-lg">
                              <button
                                type="button"
                                className="qty-btn qty-btn-lg"
                                onClick={() => decItem(item.name)}
                                disabled={qty === 0}
                              >
                                −
                              </button>
                              <span className="qty-value qty-value-lg">
                                {qty}
                              </span>
                              <button
                                type="button"
                                className="qty-btn qty-btn-lg"
                                onClick={() => addItem(item.name, item.price)}
                              >
                                +
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <label className="field-label" htmlFor="manual-note">
                {sq.orderNote}
              </label>
              <textarea
                id="manual-note"
                className="order-note-input"
                rows={2}
                maxLength={280}
                placeholder={sq.orderNotePlaceholder}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
        </div>

        <footer className="manual-sheet-footer">
          <div className="manual-footer-meta">
            <span>
              {itemCount} {itemCount === 1 ? sq.itemOne : sq.items}
            </span>
            <strong>{formatEuro(total)}</strong>
          </div>
          {err && <p className="form-error">{err}</p>}
          <button
            type="button"
            className="btn btn-primary btn-block btn-lg manual-confirm-btn"
            disabled={lines.length === 0 || submitting || step !== 'items'}
            onClick={() => void submit()}
          >
            {submitting ? sq.sending : sq.confirmManual}
          </button>
        </footer>
      </div>
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
  const [staffList, setStaffList] = useState<StaffProfile[]>([])
  const [nameMap, setNameMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionHint, setSessionHint] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(true)
  const [showCancelled, setShowCancelled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [tab, setTab] = useState<Tab>('live')
  const [salesRange, setSalesRange] = useState<SalesRange>('today')
  const [salesOrders, setSalesOrders] = useState<Order[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [speedWorkerId, setSpeedWorkerId] = useState<string | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
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
    if (p) {
      setProfile(p)
      await ensureStaffSession(p)
    } else {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (isDemoAuth()) {
        if (!cancelled) {
          const p = getDemoProfile()
          setProfile(p)
          if (p) await ensureStaffSession(p)
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
      const p = getDemoProfile()
      setProfile(p)
      if (p) await ensureStaffSession(p)
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
    setSpeedWorkerId(null)
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
    const [map, profilesRes] = await Promise.all([
      fetchStaffNameMap(),
      fetchStaffProfiles(),
    ])
    if (profile) {
      map[profile.id] =
        profile.display_name ||
        profile.email.split('@')[0] ||
        profile.id
    }
    if (profilesRes.data) {
      for (const p of profilesRes.data) {
        if (p.display_name) map[p.id] = p.display_name
      }
      setStaffList(profilesRes.data)
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
    if (sessionsRes.error) {
      setSessionHint(sq.migrationHint)
      setSessions([])
    } else {
      setSessionHint(null)
      setSessions(sessionsRes.data)
    }
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

  // Tick every 30s so wait times / priority update without refresh
  const [, setBoardTick] = useState(0)
  useEffect(() => {
    if (!profile) return
    const id = window.setInterval(() => setBoardTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [profile])

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
    const { error: err } = await purgeOldArchives()
    if (err) setError(err)
    else void loadArchive()
  }

  const handleManualCreated = (order: Order) => {
    // Mark known before state update so realtime INSERT does not double-play sound
    knownIdsRef.current.add(order.id)
    setOrders((prev) => {
      if (prev.some((o) => o.id === order.id)) return prev
      return [order, ...prev]
    })
    // No sound for staff-entered orders (only customer/realtime new orders)
  }

  const activeOrders = useMemo(() => orders.filter(isActiveOrder), [orders])

  // Oldest first = higher priority the longer they wait
  const pending = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'pending')
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [activeOrders]
  )

  const completed = useMemo(() => {
    let list = activeOrders.filter((o) => o.status === 'done')
    if (!isAdmin && profile) {
      list = list.filter((o) => o.completed_by === profile.id)
    }
    return list.sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at).getTime() -
        new Date(a.completed_at || a.created_at).getTime()
    )
  }, [activeOrders, isAdmin, profile])

  const cancelled = useMemo(() => {
    let list = activeOrders.filter((o) => o.status === 'cancelled')
    if (!isAdmin && profile) {
      list = list.filter((o) => o.completed_by === profile.id)
    }
    return list.sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at).getTime() -
        new Date(a.completed_at || a.created_at).getTime()
    )
  }, [activeOrders, isAdmin, profile])

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
  const cancelCount = useMemo(
    () => statsPool.filter((o) => o.status === 'cancelled').length,
    [statsPool]
  )
  const itemSales = useMemo(() => buildItemSales(statsPool), [statsPool])
  const speedStats = useMemo(() => buildSpeedStats(statsPool), [statsPool])
  const tableStats = useMemo(() => buildTableStats(statsPool), [statsPool])
  const peakHours = useMemo(() => buildPeakHours(statsPool), [statsPool])
  const workerRoster = useMemo(
    () => mergeWorkerRoster(staffList, statsPool, nameMap),
    [staffList, statsPool, nameMap]
  )

  const onlineUserIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) {
      if (!s.ended_at) set.add(s.user_id)
    }
    return set
  }, [sessions])

  const itemsTotalQty = useMemo(
    () => itemSales.reduce((s, i) => s + i.quantity, 0),
    [itemSales]
  )

  const selectedWorker = speedWorkerId
    ? workerRoster.find((w) => w.userId === speedWorkerId)
    : null
  const workerOrders = speedWorkerId
    ? ordersByWorker(statsPool, speedWorkerId)
    : []

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
            onClick={() => {
              setSoundEnabled((v) => {
                const next = !v
                if (next) playNotificationSound()
                return next
              })
            }}
            aria-label={soundEnabled ? sq.soundOn : sq.soundOff}
            title={soundEnabled ? sq.soundOn : sq.soundOff}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            {sq.signOut}
          </button>
        </div>
      </header>

      {isAdmin && (
        <nav className="dashboard-tabs">
          {(
            [
              ['live', sq.liveBoard],
              ['sales', sq.salesHistory],
              ['speed', sq.performance],
              ['team', sq.team],
              ['archive', sq.archiveTab],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`dash-tab ${tab === key ? 'is-active' : ''}`}
              onClick={() => {
                setTab(key)
                if (key !== 'speed') setSpeedWorkerId(null)
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {!isSupabaseConfigured && (
        <div className="banner banner-warn">
          <strong>Demo</strong> — {sq.demoBanner}
        </div>
      )}
      {error && <div className="banner banner-error">{error}</div>}
      {sessionHint && tab === 'team' && (
        <div className="banner banner-info">{sessionHint}</div>
      )}

      <main className="dashboard-main">
        {tab === 'live' && (
          <>
            <div className="live-toolbar">
              <button
                type="button"
                className="btn btn-primary manual-open-btn"
                onClick={() => setManualOpen(true)}
              >
                {sq.addManual}
              </button>
            </div>

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
            <div className="sales-summary sales-summary-wide">
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
              <div className="sales-stat-card">
                <span className="stat-label">{sq.cancelledRate}</span>
                <span className="sales-stat-value">
                  {salesLoading
                    ? '…'
                    : doneCount + cancelCount === 0
                      ? '—'
                      : `${cancelCount} (${Math.round(
                          (cancelCount / (doneCount + cancelCount)) * 100
                        )}%)`}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">{sq.itemsTotal}</span>
                <span className="sales-stat-value">
                  {salesLoading ? '…' : itemsTotalQty}
                </span>
              </div>
              <div className="sales-stat-card">
                <span className="stat-label">{sq.topItem}</span>
                <span className="sales-stat-value sales-stat-value-sm">
                  {salesLoading || !itemSales[0]
                    ? '—'
                    : itemSales[0].name}
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
                    <ShowMoreTableBody
                      items={tableStats}
                      colSpan={4}
                      renderRow={(row) => (
                        <tr key={row.table}>
                          <td>
                            {sq.table} {row.table}
                          </td>
                          <td>{row.orders}</td>
                          <td>{formatEuro(row.revenue)}</td>
                          <td>{row.cancelled}</td>
                        </tr>
                      )}
                    />
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
                    <ShowMoreTableBody
                      items={peakHours}
                      colSpan={3}
                      renderRow={(row) => (
                        <tr key={row.hour}>
                          <td>{String(row.hour).padStart(2, '0')}:00</td>
                          <td>{row.count}</td>
                          <td>{formatEuro(row.revenue)}</td>
                        </tr>
                      )}
                    />
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
                    <ShowMoreTableBody
                      items={itemSales}
                      colSpan={3}
                      renderRow={(row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td>{row.quantity}</td>
                          <td>{formatEuro(row.revenue)}</td>
                        </tr>
                      )}
                    />
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
              <RangePills
                value={salesRange}
                onChange={(r) => {
                  setSalesRange(r)
                  setSpeedWorkerId(null)
                }}
              />
            </div>

            {!speedWorkerId && (
              <>
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
                        : `${Math.round(
                            (speedStats.under5min / speedStats.count) * 100
                          )}%`}
                    </span>
                  </div>
                  <div className="sales-stat-card">
                    <span className="stat-label">{sq.under10}</span>
                    <span className="sales-stat-value">
                      {speedStats.count === 0
                        ? '—'
                        : `${Math.round(
                            (speedStats.under10min / speedStats.count) * 100
                          )}%`}
                    </span>
                  </div>
                </div>

                <h2 className="section-label">{sq.allWorkers}</h2>
                {workerRoster.length === 0 ? (
                  <p className="empty-state">{sq.noWorkersListed}</p>
                ) : (
                  <div className="worker-card-list">
                    {workerRoster.map((w) => (
                      <button
                        key={w.userId}
                        type="button"
                        className="worker-card"
                        onClick={() => setSpeedWorkerId(w.userId)}
                      >
                        <div className="worker-card-top">
                          <strong>{w.name}</strong>
                          <span
                            className={`online-dot ${
                              onlineUserIds.has(w.userId) ? 'is-on' : ''
                            }`}
                          >
                            {onlineUserIds.has(w.userId)
                              ? sq.onlineNow
                              : sq.offline}
                          </span>
                        </div>
                        <div className="worker-card-stats">
                          <span>
                            {sq.finished}: <b>{w.done}</b>
                          </span>
                          <span>
                            {sq.avgTime}:{' '}
                            <b>
                              {w.avgSeconds == null
                                ? '—'
                                : formatDuration(Math.round(w.avgSeconds))}
                            </b>
                          </span>
                          <span>
                            {sq.rev}: <b>{formatEuro(w.revenue)}</b>
                          </span>
                        </div>
                        <span className="worker-card-cta">{sq.openProfile}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {speedWorkerId && selectedWorker && (
              <>
                <button
                  type="button"
                  className="back-link speed-back"
                  onClick={() => {
                    setSpeedWorkerId(null)
                    setExpandedOrderId(null)
                  }}
                >
                  {sq.backToWorkers}
                </button>
                <h2 className="section-label">
                  {sq.workerProfile}: {selectedWorker.name}
                </h2>
                <div className="sales-summary">
                  <div className="sales-stat-card">
                    <span className="stat-label">{sq.finished}</span>
                    <span className="sales-stat-value">
                      {selectedWorker.done}
                    </span>
                  </div>
                  <div className="sales-stat-card">
                    <span className="stat-label">{sq.cancelled}</span>
                    <span className="sales-stat-value">
                      {selectedWorker.cancelled}
                    </span>
                  </div>
                  <div className="sales-stat-card">
                    <span className="stat-label">{sq.avgTime}</span>
                    <span className="sales-stat-value">
                      {selectedWorker.avgSeconds == null
                        ? '—'
                        : formatDuration(
                            Math.round(selectedWorker.avgSeconds)
                          )}
                    </span>
                  </div>
                  <div className="sales-stat-card">
                    <span className="stat-label">{sq.rev}</span>
                    <span className="sales-stat-value">
                      {formatEuro(selectedWorker.revenue)}
                    </span>
                  </div>
                </div>

                <h2 className="section-label">{sq.workerOrders}</h2>
                {workerOrders.length === 0 ? (
                  <p className="empty-state">{sq.noWorkerOrders}</p>
                ) : (
                  <div className="worker-order-list">
                    <ShowMoreBlock
                      items={workerOrders}
                      render={(order) => {
                        const open = expandedOrderId === order.id
                        let secs: number | null = null
                        if (order.completed_at) {
                          secs = Math.round(
                            (new Date(order.completed_at).getTime() -
                              new Date(order.created_at).getTime()) /
                              1000
                          )
                        }
                        return (
                          <div key={order.id} className="worker-order-row">
                            <button
                              type="button"
                              className="worker-order-head"
                              onClick={() =>
                                setExpandedOrderId(open ? null : order.id)
                              }
                            >
                              <span>
                                {sq.table} {order.table_number} ·{' '}
                                {order.status === 'done'
                                  ? sq.finished
                                  : sq.cancelled}
                              </span>
                              <span>
                                {secs != null && secs >= 0
                                  ? formatDuration(secs)
                                  : '—'}{' '}
                                · {formatEuro(Number(order.total))}
                              </span>
                            </button>
                            {open && (
                              <div className="worker-order-body">
                                <p className="muted-date">
                                  {formatTime(
                                    order.completed_at || order.created_at
                                  )}{' '}
                                  · {sq.orderDetails}
                                </p>
                                <ul className="order-card-items">
                                  {order.items.map((item) => (
                                    <li key={item.name}>
                                      <span className="order-card-qty">
                                        {item.quantity}×
                                      </span>
                                      <span>
                                        {item.name} (
                                        {formatEuro(item.price * item.quantity)}
                                        )
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                                {order.note && (
                                  <p className="order-card-note">
                                    <span className="order-card-note-label">
                                      {sq.noteLabel}
                                    </span>
                                    {order.note}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === 'team' && isAdmin && (
          <section className="dashboard-section sales-section">
            <div className="sales-toolbar">
              <RangePills value={salesRange} onChange={setSalesRange} />
            </div>

            <h2 className="section-label">{sq.onlineNow}</h2>
            {staffList.length === 0 ? (
              <p className="empty-state">{sq.noWorkersListed}</p>
            ) : (
              <div className="online-grid">
                {staffList.map((p) => {
                  const on = onlineUserIds.has(p.id)
                  return (
                    <div
                      key={p.id}
                      className={`online-chip ${on ? 'is-on' : ''}`}
                    >
                      <span className="online-chip-dot" />
                      <span>
                        {p.display_name || nameMap[p.id] || sq.unknownStaff}
                      </span>
                      <em>{on ? sq.stillActive : sq.offline}</em>
                    </div>
                  )
                })}
              </div>
            )}

            <h2 className="section-label">{sq.workerStats}</h2>
            {workerRoster.length === 0 ? (
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
                    <ShowMoreTableBody
                      items={workerRoster}
                      colSpan={5}
                      renderRow={(w) => (
                        <tr key={w.userId}>
                          <td>
                            {w.name}
                            {onlineUserIds.has(w.userId) && (
                              <span className="inline-online"> · online</span>
                            )}
                          </td>
                          <td>{w.done}</td>
                          <td>{w.cancelled}</td>
                          <td>
                            {w.avgSeconds == null
                              ? '—'
                              : formatDuration(Math.round(w.avgSeconds))}
                          </td>
                          <td>{formatEuro(w.revenue)}</td>
                        </tr>
                      )}
                    />
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
                    <ShowMoreTableBody
                      items={sessions}
                      colSpan={4}
                      renderRow={(s) => {
                        const secs = sessionDurationSeconds(s)
                        return (
                          <tr key={s.id}>
                            <td>
                              {s.display_name ||
                                nameMap[s.user_id] ||
                                sq.unknownStaff}
                            </td>
                            <td>
                              {formatTime(s.started_at)}{' '}
                              <span className="muted-date">
                                {new Date(s.started_at).toLocaleDateString()}
                              </span>
                            </td>
                            <td>
                              {s.ended_at
                                ? formatTime(s.ended_at)
                                : sq.stillActive}
                            </td>
                            <td>
                              {secs == null ? '—' : formatDuration(secs)}
                            </td>
                          </tr>
                        )
                      }}
                    />
                  </tbody>
                </table>
              </div>
            )}
            {sessionHint && (
              <p className="sales-footnote">{sessionHint}</p>
            )}
          </section>
        )}

        {tab === 'archive' && isAdmin && (
          <section className="dashboard-section sales-section">
            <div className="sales-toolbar">
              <p className="archive-lead">{sq.archiveHint}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePurge}
              >
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

      <ManualOrderModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={handleManualCreated}
      />
    </div>
  )
}
