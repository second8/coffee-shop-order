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
  signInWithUsername,
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
  endStaffSession,
  fetchArchivedOrders,
  fetchOrdersSince,
  fetchStaffNameMap,
  fetchStaffProfiles,
  fetchStaffSessions,
  fetchTodayOrders,
  formatDuration,
  isActiveOrder,
  buildTableBills,
  isKitchenPending,
  isOrderFullyPaid,
  isSupabaseConfigured,
  lineUnpaidQty,
  markOrderDone,
  mergeWorkerRoster,
  ordersByWorker,
  ordersToCsv,
  purgeOldArchives,
  restoreOrder,
  sessionDurationSeconds,
  subscribeDemoOrders,
  supabase,
  unpaidTotal,
  type TableBill,
} from '../lib/orders'
import {
  isAdminRole,
  isKitchenRole,
  isWaitressRole,
  roleLabelSq,
} from '../lib/staffRoles'
import TablePayModal from '../components/TablePayModal'
import AdminWipePanel from '../components/AdminWipePanel'
import CancelOrderModal from '../components/CancelOrderModal'
import { menu } from '../data/menu'
import { TABLE_COUNT } from '../data/config'
import {
  isClientOrder,
  orderDestinationLabel,
} from '../data/stickers'
import {
  formatEuro,
  formatRelativeTime,
  formatTime,
  waitMinutes,
  waitPriority,
} from '../utils/format'
import { sq } from '../i18n/sq'
import type { CartItem, Order, StaffProfile, StaffSession } from '../types'

type Tab = 'live' | 'sales' | 'speed' | 'team' | 'archive' | 'settings'
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
  onPay,
  variant,
  showDetails,
  doneLabel,
}: {
  order: Order
  staffName?: string
  onDone?: (id: string) => void
  onCancel?: (id: string) => void
  onArchive?: (id: string) => void
  onRestore?: (id: string) => void
  onDelete?: (id: string) => void
  onPay?: (order: Order) => void
  variant: 'pending' | 'done' | 'cancelled' | 'archive' | 'bill' | 'paid'
  showDetails?: boolean
  doneLabel?: string
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (variant !== 'pending' && variant !== 'bill') return
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [variant])

  const mins = waitMinutes(order.created_at)
  const priority = waitPriority(mins)
  const details = showDetails ?? true
  const owed = unpaidTotal(order)
  const kitchenReady = order.status === 'done'
  const partial =
    order.items.some((i) => lineUnpaidQty(i) < i.quantity && lineUnpaidQty(i) > 0) ||
    order.items.some((i) => (i.paid_quantity ?? 0) > 0 && !isOrderFullyPaid(order))

  return (
    <article
      className={[
        'order-card',
        isClientOrder(order) ? 'is-client-order' : '',
        variant === 'pending' ? '' : 'is-done',
        variant === 'cancelled' ? 'is-cancelled' : '',
        variant === 'archive' ? 'is-archive' : '',
        variant === 'bill' ? 'is-bill' : '',
        variant === 'bill' && kitchenReady ? 'is-ready' : '',
        variant === 'paid' ? 'is-paid' : '',
        variant === 'pending' || (variant === 'bill' && !kitchenReady)
          ? `priority-${priority}`
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="order-card-top">
        <div>
          {isClientOrder(order) && (
            <span className="client-order-badge">{sq.officeBadge}</span>
          )}
          <h2 className="order-card-table">
            {isClientOrder(order)
              ? orderDestinationLabel(order)
              : `${sq.table} ${order.table_number}`}
          </h2>
          {(variant === 'pending' || variant === 'bill') && (
            <span className={`wait-badge wait-${priority}`}>
              {mins === 0
                ? formatRelativeTime(order.created_at)
                : `${mins} min · ${sq.waiting}`}
              {variant === 'bill' && (
                <>
                  {' · '}
                  {kitchenReady ? sq.readyKitchen : sq.waitingKitchen}
                  {partial ? ` · ${sq.partialPaid}` : ''}
                </>
              )}
            </span>
          )}
        </div>
        <div className="order-card-meta">
          <span className="order-card-time">
            {variant === 'pending' || variant === 'bill'
              ? formatRelativeTime(order.created_at)
              : formatTime(order.completed_at || order.created_at)}
          </span>
          <span className="order-card-total">
            {variant === 'bill'
              ? formatEuro(owed)
              : formatEuro(Number(order.total))}
          </span>
        </div>
      </div>

      {details && (
        <ul className="order-card-items">
          {order.items.map((item) => {
            const unpaid = lineUnpaidQty(item)
            return (
              <li key={item.name}>
                <span className="order-card-qty">{item.quantity}×</span>
                <span>
                  {item.name}
                  {variant === 'bill' && unpaid < item.quantity && (
                    <em className="item-paid-hint">
                      {' '}
                      ({item.quantity - unpaid} {sq.paidLine.toLowerCase()})
                    </em>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {order.note && (
        <p className="order-card-note">
          <span className="order-card-note-label">{sq.noteLabel}</span>
          {order.note}
        </p>
      )}

      {variant === 'paid' && (
        <div className="paid-details">
          <p>
            <span className="paid-k">{sq.paidAt}</span>{' '}
            {order.paid_at
              ? `${formatTime(order.paid_at)} · ${new Date(order.paid_at).toLocaleDateString()}`
              : '—'}
          </p>
          {staffName && (
            <p>
              <span className="paid-k">{sq.paidBy}</span> {staffName}
            </p>
          )}
          {order.completed_at && (
            <p>
              <span className="paid-k">{sq.kitchenReadyAt}</span>{' '}
              {formatTime(order.completed_at)}
            </p>
          )}
          <p>
            <span className="paid-k">{sq.fullTotal}</span>{' '}
            {formatEuro(Number(order.total))}
          </p>
          {order.payment_events && order.payment_events.length > 0 && (
            <div className="payment-events">
              <span className="paid-k">{sq.paymentHistory}</span>
              <ul>
                {order.payment_events.map((ev, i) => (
                  <li key={`${ev.at}-${i}`}>
                    <div>
                      {formatTime(ev.at)} · {formatEuro(ev.amount)}
                      {ev.people ? ` · ${sq.peopleSplit} ${ev.people}` : ''}
                      {ev.note ? ` · ${ev.note}` : ''}
                    </div>
                    <div className="payment-event-lines">
                      {ev.lines.map((l) => (
                        <span key={`${l.name}-${l.quantity}`}>
                          {l.quantity}× {l.name}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {staffName &&
        variant !== 'pending' &&
        variant !== 'bill' &&
        variant !== 'paid' && (
          <p className="order-card-by">
            {sq.by} <strong>{staffName}</strong>
          </p>
        )}

      {variant === 'cancelled' && order.cancel_reason && (
        <p className="cancel-reason-line">
          <span className="paid-k">{sq.cancelReasonLabel}</span>{' '}
          {order.cancel_reason}
        </p>
      )}

      <div className="order-card-actions">
        {variant === 'pending' && onDone && (
          <button
            type="button"
            className="btn btn-done"
            onClick={() => onDone(order.id)}
          >
            {doneLabel || sq.markReady}
          </button>
        )}
        {variant === 'pending' && onCancel && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onCancel(order.id)}
          >
            {sq.cancel}
          </button>
        )}
        {variant === 'bill' && onPay && (
          <button
            type="button"
            className="btn btn-done"
            onClick={() => onPay(order)}
          >
            {sq.pay}
          </button>
        )}
        {variant === 'bill' && onCancel && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onCancel(order.id)}
          >
            {sq.cancel}
          </button>
        )}
        {(variant === 'done' ||
          variant === 'cancelled' ||
          variant === 'paid') &&
          onArchive && (
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
    // Always new kitchen ticket; kamerier groups by table until Paguaj
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
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [payBill, setPayBill] = useState<TableBill | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)

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
  const [realtimeOk, setRealtimeOk] = useState(true)
  const [tab, setTab] = useState<Tab>('live')
  const [salesRange, setSalesRange] = useState<SalesRange>('today')
  const [salesOrders, setSalesOrders] = useState<Order[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [speedWorkerId, setSpeedWorkerId] = useState<string | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const readyForSoundRef = useRef(false)

  const isAdmin = profile ? isAdminRole(profile.role) : false
  const isKitchen = profile ? isKitchenRole(profile.role) : false
  const isWaitress = profile ? isWaitressRole(profile.role) : false

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
    const { error: err } = await signInWithUsername(username, password)
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
      const cleaned = profilesRes.data.map((p) => {
        let name = p.display_name
        if (name && /vjetër/i.test(name)) {
          name =
            p.role === 'waitress' || p.role === 'worker'
              ? name.replace(/\(vjetër[^)]*\)/i, '').trim() || 'Staf'
              : name.replace(/\(vjetër[^)]*\)/i, '').trim() || 'Staf'
        }
        if (name) map[p.id] = name
        return { ...p, display_name: name }
      })
      setStaffList(cleaned)
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
    let disposed = false
    let channel = client.channel('orders-realtime-v2')

    const attach = () => {
      channel = client
        .channel(`orders-realtime-${Date.now()}`)
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
                if (order.archived_at)
                  return prev.filter((o) => o.id !== order.id)
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
        .subscribe((status) => {
          if (disposed) return
          if (status === 'SUBSCRIBED') {
            setRealtimeOk(true)
          }
          if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            setRealtimeOk(false)
            void loadOrders()
            window.setTimeout(() => {
              if (disposed) return
              void client.removeChannel(channel)
              attach()
            }, 2000)
          }
        })
    }

    attach()
    return () => {
      disposed = true
      void client.removeChannel(channel)
    }
  }, [profile, soundEnabled, loadOrders])

  // End work session when tab closes (best effort)
  useEffect(() => {
    if (!profile) return
    const onPageHide = () => {
      void endStaffSession()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [profile])

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

  const handleCancel = (id: string) => {
    const order = orders.find((o) => o.id === id)
    if (order) setCancelTarget(order)
  }

  const confirmCancelWithReason = async (reason: string) => {
    if (!cancelTarget) return
    const id = cancelTarget.id
    const now = new Date().toISOString()
    patchLocal(id, {
      status: 'cancelled',
      completed_at: now,
      completed_by: profile?.id ?? null,
      cancel_reason: reason,
    })
    setCancelTarget(null)
    const { error: err } = await cancelOrder(id, profile?.id, reason)
    if (err) {
      setError(err)
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

  const cancelled = useMemo(() => {
    let list = activeOrders.filter((o) => o.status === 'cancelled')
    if (isKitchen && !isAdmin && profile) {
      list = list.filter((o) => o.completed_by === profile.id)
    }
    return list.sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at).getTime() -
        new Date(a.completed_at || a.created_at).getTime()
    )
  }, [activeOrders, isAdmin, isKitchen, profile])

  /**
   * Kamerier bills: table appears only after first Gati.
   * Pending rounds still listed dimmed on that table for context.
   */
  const tableBills = useMemo(
    () => buildTableBills(activeOrders, { requireReady: true }),
    [activeOrders]
  )

  /** Admin also sees pending-only tables in kitchen section; full open bills: */
  const allTableBills = useMemo(
    () => buildTableBills(activeOrders, { requireReady: false }),
    [activeOrders]
  )

  const kitchenPending = useMemo(
    () =>
      activeOrders
        .filter(isKitchenPending)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [activeOrders]
  )

  const paidToday = useMemo(
    () =>
      activeOrders
        .filter((o) => Boolean(o.paid_at) || isOrderFullyPaid(o))
        .filter((o) => o.status !== 'cancelled')
        .sort(
          (a, b) =>
            new Date(b.paid_at || b.completed_at || b.created_at).getTime() -
            new Date(a.paid_at || a.completed_at || a.created_at).getTime()
        ),
    [activeOrders]
  )

  /** Tables ready to collect (have gati unpaid) — for admin "presin pagesë" */
  const tableBillsReady = useMemo(
    () => allTableBills.filter((b) => b.hasReady),
    [allTableBills]
  )

  /** Kitchen-ready tickets not yet paid (for "gati për shërbim") */
  const readyForService = useMemo(
    () =>
      activeOrders
        .filter((o) => o.status === 'done' && !isOrderFullyPaid(o))
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

  // Auto log-out after 1 hour without interaction
  // MUST stay above any conditional return (Rules of Hooks)
  useEffect(() => {
    if (!profile) return
    const IDLE_MS = 60 * 60 * 1000
    let last = Date.now()
    const bump = () => {
      last = Date.now()
    }
    const events = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
    ] as const
    for (const e of events) window.addEventListener(e, bump, { passive: true })
    const id = window.setInterval(() => {
      if (Date.now() - last >= IDLE_MS) {
        void handleLogout()
      }
    }, 30_000)
    return () => {
      for (const e of events) window.removeEventListener(e, bump)
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Keep pay modal bill in sync after partial payments (don't close)
  useEffect(() => {
    if (!payBill) return
    const next = tableBills.find((b) => b.key === payBill.key)
    if (!next) {
      setPayBill(null)
      return
    }
    if (
      next.unpaid !== payBill.unpaid ||
      next.ticketCount !== payBill.ticketCount ||
      next.readyCount !== payBill.readyCount
    ) {
      setPayBill(next)
    }
  }, [tableBills, payBill])

  const themeClass = isAdmin
    ? 'theme-admin'
    : isWaitress
      ? 'theme-waitress'
      : 'theme-barista'

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
          <label className="field-label" htmlFor="username">
            {sq.username}
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            className="text-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={sq.usernamePlaceholder}
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
    <div className={`dashboard-page ${themeClass}`}>
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <h1>{sq.orders}</h1>
          <span className="pending-pill">
            {pending.length} {sq.pending}
          </span>
          <span className={`role-pill role-${profile.role}`}>
            {roleLabelSq(profile.role)}
            {profile.display_name ? ` · ${profile.display_name}` : ''}
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

      {(isAdmin || isWaitress || isKitchen) && (
        <nav className="dashboard-tabs">
          {(
            [
              [
                'live',
                isAdmin
                  ? sq.liveBoard
                  : isWaitress
                    ? sq.floorBoard
                    : sq.kitchenBoard,
              ] as const,
              ...(isAdmin
                ? ([
                    ['sales', sq.salesHistory],
                    ['speed', sq.performance],
                    ['team', sq.team],
                    ['archive', sq.archiveTab],
                    ['settings', sq.settingsTab],
                  ] as const)
                : []),
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
      {!realtimeOk && isSupabaseConfigured && (
        <div className="banner banner-warn">{sq.realtimeOffline}</div>
      )}
      {error && <div className="banner banner-error">{error}</div>}
      {sessionHint && tab === 'team' && (
        <div className="banner banner-info">{sessionHint}</div>
      )}

      <main className="dashboard-main">
        {tab === 'live' && (
          <>
            {(isAdmin || isWaitress) && (
              <div className="live-toolbar">
                <button
                  type="button"
                  className="btn btn-primary manual-open-btn"
                  onClick={() => setManualOpen(true)}
                >
                  {sq.addManual}
                </button>
              </div>
            )}

            {/* Barista (shankist) */}
            {isKitchen && !isAdmin && (
              <>
                <section className="dashboard-section">
                  <h2 className="section-label">
                    {sq.sectionOrdering}
                    <span className="section-count">
                      {kitchenPending.length}
                    </span>
                  </h2>
                  {loading ? (
                    <p className="empty-state">{sq.loading}</p>
                  ) : kitchenPending.length === 0 ? (
                    <p className="empty-state">{sq.noPending}</p>
                  ) : (
                    <div className="order-grid">
                      {kitchenPending.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          variant="pending"
                          onDone={handleDone}
                          onCancel={handleCancel}
                          doneLabel={sq.markReady}
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
                      {sq.completedOrders}
                      <span className="section-count">
                        {
                          activeOrders.filter(
                            (o) =>
                              o.status === 'done' &&
                              o.completed_by === profile.id
                          ).length
                        }
                      </span>
                    </h2>
                    <span className="chevron">
                      {showCompleted ? '▾' : '▸'}
                    </span>
                  </button>
                  {showCompleted && (
                    <div className="order-list">
                      {activeOrders
                        .filter(
                          (o) =>
                            o.status === 'done' &&
                            o.completed_by === profile.id
                        )
                        .map((order) => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            variant="done"
                            staffName={profile.display_name || undefined}
                          />
                        ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Kamerier */}
            {isWaitress && !isAdmin && (
              <>
                <section className="dashboard-section">
                  <h2 className="section-label">
                    {sq.unpaidBills}
                    <span className="section-count">{tableBills.length}</span>
                  </h2>
                  <p className="section-hint">{sq.dimmedLegend}</p>
                  {loading ? (
                    <p className="empty-state">{sq.loading}</p>
                  ) : tableBills.length === 0 ? (
                    <p className="empty-state">{sq.noUnpaid}</p>
                  ) : (
                    <div className="order-grid">
                      {tableBills.map((bill) => (
                        <TableBillCard
                          key={bill.key}
                          bill={bill}
                          onPay={() => setPayBill(bill)}
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
                      {sq.completedOrders}
                      <span className="section-count">{paidToday.length}</span>
                    </h2>
                    <span className="chevron">
                      {showCompleted ? '▾' : '▸'}
                    </span>
                  </button>
                  {showCompleted &&
                    (paidToday.length === 0 ? (
                      <p className="empty-state">{sq.noPaidYet}</p>
                    ) : (
                      <div className="order-list">
                        {paidToday.map((order) => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            variant="paid"
                            staffName={
                              staffLabel(order.paid_by) ||
                              staffLabel(order.completed_by)
                            }
                          />
                        ))}
                      </div>
                    ))}
                </section>
              </>
            )}

            {/* Admin: 4 stages */}
            {isAdmin && (
              <>
                <section className="dashboard-section status-section status-ordering">
                  <h2 className="section-label">
                    {sq.sectionOrdering}
                    <span className="section-count">
                      {kitchenPending.length}
                    </span>
                  </h2>
                  <p className="section-hint">{sq.sectionOrderingHint}</p>
                  {loading ? (
                    <p className="empty-state">{sq.loading}</p>
                  ) : kitchenPending.length === 0 ? (
                    <p className="empty-state">{sq.noPending}</p>
                  ) : (
                    <div className="order-grid">
                      {kitchenPending.map((order) => (
                        <OrderCard
                          key={`k-${order.id}`}
                          order={order}
                          variant="pending"
                          onDone={handleDone}
                          onCancel={handleCancel}
                          doneLabel={sq.markReady}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="dashboard-section status-section status-ready">
                  <h2 className="section-label">
                    {sq.sectionReadyUnpaid}
                    <span className="section-count">
                      {readyForService.length}
                    </span>
                  </h2>
                  <p className="section-hint">{sq.sectionReadyHint}</p>
                  {readyForService.length === 0 ? (
                    <p className="empty-state">{sq.noUnpaid}</p>
                  ) : (
                    <div className="order-grid">
                      {readyForService.map((order) => (
                        <OrderCard
                          key={`r-${order.id}`}
                          order={order}
                          variant="done"
                          staffName={staffLabel(order.completed_by)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="dashboard-section status-section status-waiting">
                  <h2 className="section-label">
                    {sq.sectionAwaitingPay}
                    <span className="section-count">
                      {tableBillsReady.length}
                    </span>
                  </h2>
                  <p className="section-hint">{sq.sectionPayHint}</p>
                  {tableBillsReady.length === 0 ? (
                    <p className="empty-state">—</p>
                  ) : (
                    <div className="order-grid">
                      {tableBillsReady.map((bill) => (
                        <TableBillCard
                          key={`pay-${bill.key}`}
                          bill={bill}
                          onPay={() => setPayBill(bill)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="dashboard-section status-section status-paid">
                  <button
                    type="button"
                    className="section-toggle"
                    onClick={() => setShowCompleted((v) => !v)}
                  >
                    <h2 className="section-label">
                      {sq.sectionPaid}
                      <span className="section-count">{paidToday.length}</span>
                    </h2>
                    <span className="chevron">
                      {showCompleted ? '▾' : '▸'}
                    </span>
                  </button>
                  {showCompleted &&
                    (paidToday.length === 0 ? (
                      <p className="empty-state">{sq.noPaidYet}</p>
                    ) : (
                      <div className="order-list">
                        {paidToday.map((order) => (
                          <OrderCard
                            key={`paid-${order.id}`}
                            order={order}
                            variant="paid"
                            staffName={
                              staffLabel(order.paid_by) ||
                              staffLabel(order.completed_by)
                            }
                            onArchive={handleArchive}
                          />
                        ))}
                      </div>
                    ))}
                </section>

                <section className="dashboard-section status-section status-cancelled">
                  <button
                    type="button"
                    className="section-toggle"
                    onClick={() => setShowCancelled((v) => !v)}
                  >
                    <h2 className="section-label">
                      {sq.sectionCancelled}
                      <span className="section-count">{cancelled.length}</span>
                    </h2>
                    <span className="chevron">
                      {showCancelled ? '▾' : '▸'}
                    </span>
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
                            onArchive={handleArchive}
                          />
                        ))}
                      </div>
                    ))}
                </section>
              </>
            )}
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
                                {orderDestinationLabel(order)} ·{' '}
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

        {tab === 'settings' && isAdmin && (
          <>
            <section className="dashboard-section">
              <h2 className="section-label">{sq.stickersTab}</h2>
              <p className="archive-lead">
                Printoni ngjitëse tavolinash dhe klientësh (zyra). Faqja është
                e mbrojtur — vetëm admin.
              </p>
              <a className="btn btn-primary" href="/qr">
                {sq.stickersTab}
              </a>
            </section>
            <AdminWipePanel
              onWiped={() => {
                setOrders([])
                setArchive([])
                setSalesOrders([])
                setSessions([])
                void loadOrders()
              }}
            />
          </>
        )}
      </main>

      <ManualOrderModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={handleManualCreated}
      />

      {payBill && (
        <TablePayModal
          bill={payBill}
          staffId={profile.id}
          onClose={() => setPayBill(null)}
          onPartialPaid={() => {
            void loadOrders()
          }}
          onFullyPaid={() => {
            setPayBill(null)
            void loadOrders()
          }}
        />
      )}

      {cancelTarget && (
        <CancelOrderModal
          tableNumber={cancelTarget.table_number}
          onClose={() => setCancelTarget(null)}
          onConfirm={confirmCancelWithReason}
        />
      )}
    </div>
  )
}

/** Kamerier: table invoice with rounds (newest on top). */
function TableBillCard({
  bill,
  onPay,
}: {
  bill: TableBill
  onPay: () => void
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <article
      className={[
        'order-card is-bill',
        bill.clientName ? 'is-client-order' : '',
        bill.allReady ? 'is-ready' : '',
        bill.hasPending ? 'is-mixed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="order-card-top">
        <div>
          {bill.clientName && (
            <span className="client-order-badge">{sq.officeBadge}</span>
          )}
          <h2 className="order-card-table">
            {bill.clientName
              ? bill.clientName
              : `${sq.table} ${bill.table}`}
          </h2>
          <span
            className={`wait-badge ${bill.allReady ? 'wait-warm' : 'wait-hot'}`}
          >
            {bill.readyCount}/{bill.ticketCount} {sq.rounds} {sq.readyToPay}
            {bill.hasPending ? ` · ${sq.inProgress}` : ''}
          </span>
        </div>
        <div className="order-card-meta">
          <span className="order-card-time">
            {formatRelativeTime(bill.newestAt)}
          </span>
          <span className="order-card-total">{formatEuro(bill.unpaid)}</span>
        </div>
      </div>

      <div className="round-list">
        {bill.orders.map((order, idx) => {
          const ready = order.status === 'done'
          return (
            <div
              key={order.id}
              className={`round-block ${ready ? 'is-ready' : 'is-pending'}`}
            >
              <div className="round-head">
                <span>
                  {sq.round} {bill.orders.length - idx}
                </span>
                <span className={`round-status ${ready ? 'ok' : 'wait'}`}>
                  {ready ? sq.readyToPay : sq.inProgress}
                </span>
                <span className="round-time">
                  {formatRelativeTime(order.created_at)}
                </span>
              </div>
              <ul className="order-card-items">
                {order.items.map((item) => (
                  <li key={item.name}>
                    <span className="order-card-qty">{item.quantity}×</span>
                    <span>{item.name}</span>
                  </li>
                ))}
              </ul>
              {order.note && (
                <p className="order-card-note round-note">{order.note}</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="order-card-actions">
        <button
          type="button"
          className="btn btn-done"
          disabled={bill.unpaid <= 0}
          onClick={onPay}
        >
          {sq.pay}
          {bill.unpaid > 0 ? ` · ${formatEuro(bill.unpaid)}` : ''}
        </button>
      </div>
    </article>
  )
}
