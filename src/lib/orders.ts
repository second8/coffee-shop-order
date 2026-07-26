import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { menu } from '../data/menu'
import type {
  CartItem,
  Order,
  PaymentEvent,
  StaffProfile,
  StaffSession,
} from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project') &&
    supabaseAnonKey !== 'your-anon-key'
)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

const DEMO_KEY = 'cafe-sol-demo-orders'
const DEMO_SESSIONS_KEY = 'cafe-sol-demo-sessions'
const DEMO_EVENT = 'cafe-sol-demo-orders-changed'
const SESSION_ID_KEY = 'cafe-sol-session-id'

const MAX_TABLE = 100
const MAX_QTY_PER_ITEM = 20
const MAX_LINES = 30
const MAX_NOTE_LEN = 280
const ARCHIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const menuPriceByName = new Map(
  menu.categories.flatMap((c) => c.items.map((i) => [i.name, i.price] as const))
)

function readDemoOrders(): Order[] {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Order[]
  } catch {
    return []
  }
}

function writeDemoOrders(orders: Order[]) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(orders))
  window.dispatchEvent(new Event(DEMO_EVENT))
}

function readDemoSessions(): StaffSession[] {
  try {
    const raw = localStorage.getItem(DEMO_SESSIONS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StaffSession[]
  } catch {
    return []
  }
}

function writeDemoSessions(sessions: StaffSession[]) {
  localStorage.setItem(DEMO_SESSIONS_KEY, JSON.stringify(sessions))
}

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isActiveOrder(o: Order): boolean {
  return !o.archived_at
}

export function linePaidQty(item: CartItem): number {
  const p = Math.floor(Number(item.paid_quantity ?? 0))
  if (!Number.isFinite(p) || p < 0) return 0
  return Math.min(p, item.quantity)
}

export function lineUnpaidQty(item: CartItem): number {
  return Math.max(0, item.quantity - linePaidQty(item))
}

export function unpaidTotal(order: Order): number {
  return order.items.reduce(
    (sum, i) => sum + i.price * lineUnpaidQty(i),
    0
  )
}

export function isOrderFullyPaid(order: Order): boolean {
  if (order.paid_at) return true
  if (order.status === 'cancelled') return true
  return order.items.every((i) => lineUnpaidQty(i) === 0) && order.items.length > 0
}

/** Open bill for waitress: not cancelled, not archived, not fully paid. */
export function isOpenBill(o: Order): boolean {
  return (
    isActiveOrder(o) &&
    o.status !== 'cancelled' &&
    !isOrderFullyPaid(o)
  )
}

/** Kitchen still needs to prepare. */
export function isKitchenPending(o: Order): boolean {
  return isActiveOrder(o) && o.status === 'pending'
}

export function mergeCartItems(
  existing: CartItem[],
  added: CartItem[]
): CartItem[] {
  const map = new Map<string, CartItem>()
  for (const i of existing) {
    map.set(i.name, {
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      paid_quantity: linePaidQty(i),
    })
  }
  for (const i of added) {
    const prev = map.get(i.name)
    if (prev) {
      prev.quantity = Math.min(MAX_QTY_PER_ITEM * 2, prev.quantity + i.quantity)
      // unpaid new units keep paid_quantity as-is
    } else {
      map.set(i.name, {
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        paid_quantity: 0,
      })
    }
  }
  return [...map.values()]
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((s, i) => s + i.price * i.quantity, 0)
}

export function sanitizeOrderInput(
  tableNumber: number,
  items: CartItem[]
): { items: CartItem[]; total: number; error: string | null } {
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > MAX_TABLE) {
    return { items: [], total: 0, error: 'Numri i tavolinës është i pavlefshëm' }
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], total: 0, error: 'Porosia është bosh' }
  }
  if (items.length > MAX_LINES) {
    return { items: [], total: 0, error: 'Shumë artikuj në një porosi' }
  }
  const cleaned: CartItem[] = []
  for (const raw of items) {
    if (!raw || typeof raw.name !== 'string') {
      return { items: [], total: 0, error: 'Artikull i pavlefshëm' }
    }
    const price = menuPriceByName.get(raw.name)
    if (price === undefined) {
      return { items: [], total: 0, error: `Artikull i panjohur: ${raw.name}` }
    }
    const quantity = Math.floor(Number(raw.quantity))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QTY_PER_ITEM) {
      return { items: [], total: 0, error: `Sasi e pavlefshme për ${raw.name}` }
    }
    cleaned.push({ name: raw.name, price, quantity })
  }
  const total = cleaned.reduce((sum, i) => sum + i.price * i.quantity, 0)
  return { items: cleaned, total, error: null }
}

export function subscribeDemoOrders(onChange: () => void): () => void {
  const handler = () => onChange()
  window.addEventListener(DEMO_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(DEMO_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function sanitizeNote(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) return null
  return t.slice(0, MAX_NOTE_LEN)
}

export type CreateOrderOptions = {
  /**
   * Staff dashboard / manual order: one direct insert (no API).
   * Avoids double-insert when /api/create-order already wrote a row.
   *
   * Note: kitchen always gets a NEW ticket per submit (shankist tasks).
   * Kamerier groups open tickets by table until "Paguaj".
   */
  mode?: 'customer' | 'staff'
}

function buildOrderRow(
  tableNumber: number,
  items: CartItem[],
  total: number,
  note: string | null
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    table_number: tableNumber,
    items,
    total,
    status: 'pending',
  }
  if (note) row.note = note
  return row
}

async function insertOrderDirect(
  row: Record<string, unknown>,
  cleanNote: string | null
): Promise<{ data: Order | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Supabase not configured' }

  const cols = await orderSelectCols()
  let { data, error } = await supabase
    .from('orders')
    .insert(row)
    .select(cols)
    .single()

  // Retry without note / optional columns if schema lag
  if (error && cleanNote && error.message.toLowerCase().includes('note')) {
    const { note: _n, ...withoutNote } = row
    void _n
    const retry = await supabase
      .from('orders')
      .insert(withoutNote)
      .select(
        'id,table_number,items,total,status,created_at,completed_at,completed_by'
      )
      .single()
    data = retry.data as typeof data
    error = retry.error
  }

  if (error && error.message.toLowerCase().includes('archived_at')) {
    const retry = await supabase
      .from('orders')
      .insert(row)
      .select('id,table_number,items,total,status,created_at,completed_at,completed_by')
      .single()
    if (!retry.error && retry.data) {
      return { data: retry.data as unknown as Order, error: null }
    }
    error = retry.error
  }

  if (error) return { data: null, error: error.message }
  return { data: data as unknown as Order, error: null }
}

export async function createOrder(
  tableNumber: number,
  items: CartItem[],
  _total: number,
  note?: string | null,
  options?: CreateOrderOptions
): Promise<{ data: Order | null; error: string | null }> {
  const sanitized = sanitizeOrderInput(tableNumber, items)
  if (sanitized.error) return { data: null, error: sanitized.error }
  const cleanNote = sanitizeNote(note)
  const mode = options?.mode ?? 'customer'

  if (!supabase) {
    const order: Order = {
      id: crypto.randomUUID(),
      table_number: tableNumber,
      items: sanitized.items,
      total: sanitized.total,
      status: 'pending',
      created_at: new Date().toISOString(),
      completed_at: null,
      completed_by: null,
      archived_at: null,
      note: cleanNote,
    }
    writeDemoOrders([order, ...readDemoOrders()])
    return { data: order, error: null }
  }

  const row = buildOrderRow(
    tableNumber,
    sanitized.items,
    sanitized.total,
    cleanNote
  )

  // Staff / manual: always a new kitchen ticket (kamerier groups by table)
  if (mode === 'staff') {
    return insertOrderDirect(row, cleanNote)
  }

  // Customer: try serverless API once. If it succeeds, do NOT insert again.
  try {
    const apiRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_number: tableNumber,
        items: sanitized.items,
        note: cleanNote,
      }),
    })
    if (apiRes.ok) {
      const body = (await apiRes.json()) as { data?: Order }
      if (body.data) return { data: body.data, error: null }
      // Created on server but body missing — still do not double-insert
      return {
        data: {
          id: crypto.randomUUID(),
          table_number: tableNumber,
          items: sanitized.items,
          total: sanitized.total,
          status: 'pending',
          created_at: new Date().toISOString(),
          note: cleanNote,
        },
        error: null,
      }
    }
    // 4xx from API = validation; don't fall through (would create second row on 5xx race)
    if (apiRes.status >= 400 && apiRes.status < 500 && apiRes.status !== 404) {
      let msg = 'Porosia dështoi'
      try {
        const body = (await apiRes.json()) as { error?: string }
        if (body.error) msg = body.error
      } catch {
        // ignore
      }
      return { data: null, error: msg }
    }
  } catch {
    // Network / no API route (local dev) → direct insert once
  }

  return insertOrderDirect(row, cleanNote)
}

export async function fetchTodayOrders(): Promise<{
  data: Order[]
  error: string | null
}> {
  return fetchOrdersSince(startOfLocalDay().toISOString())
}

/** Columns that exist on the original table (safe without migration). */
const ORDER_SELECT_BASE =
  'id,table_number,items,total,status,created_at,completed_at,completed_by'

let schemaSupportsArchive: boolean | null = null
let schemaSupportsNote: boolean | null = null

/** Detect whether archived_at exists (cached). */
export async function detectArchiveSupport(): Promise<boolean> {
  if (schemaSupportsArchive !== null) return schemaSupportsArchive
  if (!supabase) {
    schemaSupportsArchive = true
    return true
  }
  const { error } = await supabase
    .from('orders')
    .select('archived_at')
    .limit(1)
  schemaSupportsArchive = !error
  return schemaSupportsArchive
}

export async function detectNoteSupport(): Promise<boolean> {
  if (schemaSupportsNote !== null) return schemaSupportsNote
  if (!supabase) {
    schemaSupportsNote = true
    return true
  }
  const { error } = await supabase.from('orders').select('note').limit(1)
  schemaSupportsNote = !error
  return schemaSupportsNote
}

let schemaSupportsPaid: boolean | null = null

export async function detectPaidSupport(): Promise<boolean> {
  if (schemaSupportsPaid !== null) return schemaSupportsPaid
  if (!supabase) {
    schemaSupportsPaid = true
    return true
  }
  const { error } = await supabase.from('orders').select('paid_at').limit(1)
  schemaSupportsPaid = !error
  return schemaSupportsPaid
}

async function orderSelectCols(): Promise<string> {
  const hasArchive = await detectArchiveSupport()
  const hasNote = await detectNoteSupport()
  const hasPaid = await detectPaidSupport()
  let cols = ORDER_SELECT_BASE
  if (hasArchive) cols += ',archived_at'
  if (hasNote) cols += ',note'
  if (hasPaid) cols += ',paid_at,paid_by,payment_events,cancel_reason'
  return cols
}

function appendPaymentEvent(
  order: Order,
  event: PaymentEvent
): PaymentEvent[] {
  const prev = Array.isArray(order.payment_events) ? order.payment_events : []
  return [...prev, event]
}

/**
 * Find open bill for table (unpaid, not cancelled) and append items.
 * Returns { data: null, error: null } if no open bill (caller should insert new).
 */
export async function mergeIntoOpenTableOrder(
  tableNumber: number,
  newItems: CartItem[],
  note: string | null
): Promise<{ data: Order | null; error: string | null }> {
  const since = startOfLocalDay().toISOString()

  if (!supabase) {
    const list = readDemoOrders()
    const open = list
      .filter(
        (o) =>
          o.table_number === tableNumber &&
          isOpenBill(o) &&
          new Date(o.created_at).getTime() >= new Date(since).getTime()
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]
    if (!open) return { data: null, error: null }
    const items = mergeCartItems(open.items, newItems)
    const total = cartTotal(items)
    const noteMerged = [open.note, note].filter(Boolean).join(' · ') || null
    // If was done (kitchen ready), new food → back to pending for barista
    const status = open.status === 'done' ? 'pending' : open.status
    const updated: Order = {
      ...open,
      items,
      total,
      note: noteMerged,
      status,
      completed_at: status === 'pending' ? null : open.completed_at,
    }
    writeDemoOrders(list.map((o) => (o.id === open.id ? updated : o)))
    return { data: updated, error: null }
  }

  const cols = await orderSelectCols()
  const { data: rows, error } = await supabase
    .from('orders')
    .select(cols)
    .eq('table_number', tableNumber)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) return { data: null, error: error.message }

  const open = ((rows as unknown as Order[]) ?? []).find((o) => isOpenBill(o))
  if (!open) return { data: null, error: null }

  const items = mergeCartItems(open.items, newItems)
  const total = cartTotal(items)
  const noteMerged = [open.note, note].filter(Boolean).join(' · ') || null
  const status = open.status === 'done' ? 'pending' : open.status

  const patch: Partial<Order> = {
    items,
    total,
    note: noteMerged,
    status,
  }
  if (status === 'pending') {
    patch.completed_at = null
    patch.completed_by = null
  }

  const { error: upErr } = await patchOrder(open.id, patch)
  if (upErr) return { data: null, error: upErr }

  return {
    data: {
      ...open,
      ...patch,
    },
    error: null,
  }
}

/** Selection of qty to pay per item name. */
export type PaySelection = Record<string, number>

export function applyPaySelection(
  order: Order,
  selection: PaySelection
): { items: CartItem[]; fullyPaid: boolean; paidAmount: number } {
  let paidAmount = 0
  const items = order.items.map((line) => {
    const want = Math.floor(Number(selection[line.name] ?? 0))
    const unpaid = lineUnpaidQty(line)
    const payNow = Math.max(0, Math.min(unpaid, want))
    paidAmount += payNow * line.price
    return {
      ...line,
      paid_quantity: linePaidQty(line) + payNow,
    }
  })
  const fullyPaid =
    items.length > 0 && items.every((i) => lineUnpaidQty(i) === 0)
  return { items, fullyPaid, paidAmount }
}

export async function markOrderPaid(
  orderId: string,
  staffUserId?: string | null,
  meta?: { people?: number | null; note?: string | null }
): Promise<{ data: Order | null; error: string | null }> {
  let order: Order | null = null
  if (!supabase) {
    order = readDemoOrders().find((o) => o.id === orderId) ?? null
  } else {
    const cols = await orderSelectCols()
    const { data, error: fetchErr } = await supabase
      .from('orders')
      .select(cols)
      .eq('id', orderId)
      .maybeSingle()
    if (fetchErr) return { data: null, error: fetchErr.message }
    order = (data as unknown as Order) ?? null
  }
  if (!order) return { data: null, error: 'Porosia nuk u gjet' }

  const lines = order.items
    .map((i) => {
      const unpaid = lineUnpaidQty(i)
      if (unpaid <= 0) return null
      return { name: i.name, quantity: unpaid, price: i.price }
    })
    .filter(Boolean) as PaymentEvent['lines']
  const amount = lines.reduce((s, l) => s + l.price * l.quantity, 0)
  const now = new Date().toISOString()
  const event: PaymentEvent = {
    at: now,
    by: staffUserId ?? null,
    amount,
    people: meta?.people ?? null,
    lines,
    note: meta?.note ?? 'Paguar plotësisht',
  }
  const items = order.items.map((i) => ({
    ...i,
    paid_quantity: i.quantity,
  }))
  const patch: Partial<Order> = {
    items,
    paid_at: now,
    paid_by: staffUserId ?? null,
    payment_events: appendPaymentEvent(order, event),
  }
  if (order.status === 'pending') {
    patch.status = 'done'
    patch.completed_at = now
    patch.completed_by = staffUserId ?? null
  }

  const { error } = await patchOrder(orderId, patch)
  if (error) {
    if (error.toLowerCase().includes('payment_events')) {
      const { payment_events: _pe, ...rest } = patch
      void _pe
      const retry = await patchOrder(orderId, rest)
      if (retry.error) return { data: null, error: retry.error }
      return { data: { ...order, ...rest }, error: null }
    }
    if (error.toLowerCase().includes('paid_at')) {
      return {
        data: null,
        error:
          'Kolona paid_at mungon. Ekzekuto supabase/MIGRATION_V3_ROLES_PAY.sql',
      }
    }
    return { data: null, error }
  }
  return { data: { ...order, ...patch }, error: null }
}

export async function markPartialPay(
  orderId: string,
  selection: PaySelection,
  staffUserId?: string | null,
  meta?: { people?: number | null; note?: string | null }
): Promise<{ data: Order | null; error: string | null; paidAmount: number }> {
  let order: Order | null = null
  if (!supabase) {
    order = readDemoOrders().find((o) => o.id === orderId) ?? null
  } else {
    const cols = await orderSelectCols()
    const { data, error: fetchErr } = await supabase
      .from('orders')
      .select(cols)
      .eq('id', orderId)
      .maybeSingle()
    if (fetchErr) return { data: null, error: fetchErr.message, paidAmount: 0 }
    order = (data as unknown as Order) ?? null
  }
  if (!order) return { data: null, error: 'Porosia nuk u gjet', paidAmount: 0 }

  const result = applyPaySelection(order, selection)
  if (result.paidAmount <= 0) {
    return { data: order, error: 'Zgjidh diçka për pagesë', paidAmount: 0 }
  }

  const eventLines: PaymentEvent['lines'] = []
  for (const line of order.items) {
    const want = Math.floor(Number(selection[line.name] ?? 0))
    const payNow = Math.max(0, Math.min(lineUnpaidQty(line), want))
    if (payNow > 0) {
      eventLines.push({
        name: line.name,
        quantity: payNow,
        price: line.price,
      })
    }
  }
  const now = new Date().toISOString()
  const event: PaymentEvent = {
    at: now,
    by: staffUserId ?? null,
    amount: result.paidAmount,
    people: meta?.people ?? null,
    lines: eventLines,
    note: meta?.note ?? 'Pagesë e pjesshme',
  }

  const patch: Partial<Order> = {
    items: result.items,
    payment_events: appendPaymentEvent(order, event),
  }
  if (result.fullyPaid) {
    patch.paid_at = now
    patch.paid_by = staffUserId ?? null
    if (order.status === 'pending') {
      patch.status = 'done'
      patch.completed_at = now
      patch.completed_by = staffUserId ?? null
    }
  }

  const { error } = await patchOrder(orderId, patch)
  if (error) {
    if (error.toLowerCase().includes('payment_events')) {
      const { payment_events: _pe, ...rest } = patch
      void _pe
      const retry = await patchOrder(orderId, rest)
      if (retry.error) return { data: null, error: retry.error, paidAmount: 0 }
      return {
        data: { ...order, ...rest },
        error: null,
        paidAmount: result.paidAmount,
      }
    }
    return { data: null, error, paidAmount: 0 }
  }
  return {
    data: { ...order, ...patch },
    error: null,
    paidAmount: result.paidAmount,
  }
}

/** One open invoice per table for kamerier (many kitchen tickets summed). */
export type TableBill = {
  table: number
  /** Newest first — rounds / kitchen tickets */
  orders: Order[]
  /** Unpaid amount on READY (gati) tickets only — what kamerier can take now */
  unpaid: number
  /** Unpaid still cooking */
  pendingUnpaid: number
  /** Full ticket totals */
  gross: number
  hasPending: boolean
  allReady: boolean
  /** At least one gati ticket (table visible to kamerier) */
  hasReady: boolean
  ticketCount: number
  readyCount: number
  oldestAt: string
  newestAt: string
}

export type BuildTableBillsOpts = {
  /**
   * Kamerier: only tables that already have ≥1 Gati (ready) unpaid ticket.
   * Pending-only tables stay on shankist board only.
   */
  requireReady?: boolean
}

export function buildTableBills(
  orders: Order[],
  opts?: BuildTableBillsOpts
): TableBill[] {
  const map = new Map<number, Order[]>()
  for (const o of orders) {
    if (!isOpenBill(o)) continue
    const list = map.get(o.table_number) ?? []
    list.push(o)
    map.set(o.table_number, list)
  }
  const bills: TableBill[] = []
  for (const [table, list] of map) {
    // Newest rounds on top
    list.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const ready = list.filter((o) => o.status === 'done')
    const pending = list.filter((o) => o.status === 'pending')
    if (opts?.requireReady && ready.length === 0) continue

    const unpaid = ready.reduce((s, o) => s + unpaidTotal(o), 0)
    const pendingUnpaid = pending.reduce((s, o) => s + unpaidTotal(o), 0)
    const gross = list.reduce((s, o) => s + Number(o.total), 0)
    bills.push({
      table,
      orders: list,
      unpaid,
      pendingUnpaid,
      gross,
      hasPending: pending.length > 0,
      allReady: pending.length === 0 && ready.length > 0,
      hasReady: ready.length > 0,
      ticketCount: list.length,
      readyCount: ready.length,
      oldestAt: list[list.length - 1]!.created_at,
      newestAt: list[0]!.created_at,
    })
  }
  // Tables with newest activity first
  return bills.sort(
    (a, b) =>
      new Date(b.newestAt).getTime() - new Date(a.newestAt).getTime()
  )
}

/** Flatten unpaid lines — only Gati tickets (kamerier can collect now). */
export function tableBillLines(
  bill: TableBill,
  opts?: { readyOnly?: boolean }
): {
  key: string
  orderId: string
  name: string
  price: number
  unpaid: number
  quantity: number
  paid_quantity: number
  ready: boolean
}[] {
  const readyOnly = opts?.readyOnly !== false
  const lines: {
    key: string
    orderId: string
    name: string
    price: number
    unpaid: number
    quantity: number
    paid_quantity: number
    ready: boolean
  }[] = []
  for (const o of bill.orders) {
    const ready = o.status === 'done'
    if (readyOnly && !ready) continue
    for (const item of o.items) {
      const unpaid = lineUnpaidQty(item)
      if (unpaid <= 0) continue
      lines.push({
        key: `${o.id}::${item.name}`,
        orderId: o.id,
        name: item.name,
        price: item.price,
        unpaid,
        quantity: item.quantity,
        paid_quantity: linePaidQty(item),
        ready,
      })
    }
  }
  return lines
}

/** Mark ready (gati) open tickets for a table as fully paid. */
export async function markTablePaid(
  tableNumber: number,
  openOrders: Order[],
  staffUserId?: string | null
): Promise<{ error: string | null; paidCount: number }> {
  let paidCount = 0
  for (const o of openOrders) {
    if (o.table_number !== tableNumber) continue
    if (!isOpenBill(o)) continue
    // Only settle kitchen-ready tickets; pending stay for next round
    if (o.status !== 'done') continue
    const { error } = await markOrderPaid(o.id, staffUserId)
    if (error) return { error, paidCount }
    paidCount += 1
  }
  return { error: null, paidCount }
}

/** Admin: delete all non-archived or all orders for a fresh start. */
export async function wipeAllOrders(opts?: {
  includeArchive?: boolean
  wipeSessions?: boolean
}): Promise<{ removed: number; error: string | null }> {
  const includeArchive = opts?.includeArchive !== false
  const wipeSessions = opts?.wipeSessions !== false

  if (!supabase) {
    const before = readDemoOrders().length
    writeDemoOrders([])
    if (wipeSessions) writeDemoSessions([])
    return { removed: before, error: null }
  }

  // Delete in chunks
  let removed = 0
  const { data, error } = await supabase
    .from('orders')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('id')

  if (error) return { removed: 0, error: error.message }
  removed = data?.length ?? 0

  if (!includeArchive) {
    // already deleted all
  }

  if (wipeSessions) {
    await supabase
      .from('staff_sessions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
  }

  return { removed, error: null }
}

export async function fetchOrdersSince(sinceIso: string): Promise<{
  data: Order[]
  error: string | null
}> {
  if (!supabase) {
    const list = readDemoOrders()
      .filter((o) => new Date(o.created_at).getTime() >= new Date(sinceIso).getTime())
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    return { data: list, error: null }
  }

  const cols = await orderSelectCols()
  const { data, error } = await supabase
    .from('orders')
    .select(cols)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(3000)

  if (error) return { data: [], error: error.message }
  return { data: (data as unknown as Order[]) ?? [], error: null }
}

export async function fetchArchivedOrders(): Promise<{
  data: Order[]
  error: string | null
}> {
  if (!supabase) {
    const list = readDemoOrders()
      .filter((o) => Boolean(o.archived_at))
      .sort(
        (a, b) =>
          new Date(b.archived_at!).getTime() - new Date(a.archived_at!).getTime()
      )
    return { data: list, error: null }
  }

  const hasArchive = await detectArchiveSupport()
  if (!hasArchive) {
    return {
      data: [],
      error:
        'Kolona archived_at mungon. Ekzekuto këtë në SQL Editor: ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;',
    }
  }

  const cols = await orderSelectCols()
  const { data, error } = await supabase
    .from('orders')
    .select(cols)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(500)

  if (error) return { data: [], error: error.message }
  return { data: (data as unknown as Order[]) ?? [], error: null }
}

async function patchOrder(
  orderId: string,
  patch: Partial<Order>
): Promise<{ error: string | null }> {
  if (!supabase) {
    writeDemoOrders(
      readDemoOrders().map((o) => (o.id === orderId ? { ...o, ...patch } : o))
    )
    return { error: null }
  }

  const hasArchive = await detectArchiveSupport()
  const hasPaid = await detectPaidSupport()
  const safePatch: Record<string, unknown> = { ...patch }
  if (!hasArchive) delete safePatch.archived_at
  if (!hasPaid) {
    delete safePatch.paid_at
    delete safePatch.paid_by
    delete safePatch.payment_events
  }

  const { error } = await supabase.from('orders').update(safePatch).eq('id', orderId)
  if (!error) return { error: null }

  if (
    error.message.includes('completed_at') ||
    error.message.includes('completed_by') ||
    error.message.includes('archived_at') ||
    error.message.includes('paid_at')
  ) {
    if (typeof safePatch.status === 'string' && safePatch.status !== 'cancelled') {
      const { error: e2 } = await supabase
        .from('orders')
        .update({ status: safePatch.status })
        .eq('id', orderId)
      if (!e2) return { error: null }
      return { error: e2.message }
    }
  }

  return { error: error.message }
}

const CANCEL_SQL_HINT =
  'Në Supabase SQL Editor ekzekuto: ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check; ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (\'pending\', \'done\', \'cancelled\'));'

export async function markOrderDone(
  orderId: string,
  staffUserId?: string | null
): Promise<{ error: string | null }> {
  return patchOrder(orderId, {
    status: 'done',
    completed_at: new Date().toISOString(),
    completed_by: staffUserId ?? null,
  })
}

export async function cancelOrder(
  orderId: string,
  staffUserId?: string | null,
  reason?: string | null
): Promise<{ error: string | null }> {
  const cleanReason = (reason || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  if (cleanReason.length < 3) {
    return { error: 'Shkruaj arsyen e anulimit (min. 3 shkronja)' }
  }

  const patch: Partial<Order> = {
    status: 'cancelled',
    completed_at: new Date().toISOString(),
    completed_by: staffUserId ?? null,
    cancel_reason: cleanReason,
  }
  const result = await patchOrder(orderId, patch)

  if (!result.error) return result

  // Retry without cancel_reason if column missing
  if (result.error.toLowerCase().includes('cancel_reason')) {
    const { cancel_reason: _c, ...rest } = patch
    void _c
    const r2 = await patchOrder(orderId, rest)
    if (!r2.error) return r2
    if (
      r2.error.includes('orders_status_check') ||
      r2.error.includes('check constraint')
    ) {
      return { error: CANCEL_SQL_HINT }
    }
    return r2
  }

  if (
    result.error.includes('orders_status_check') ||
    result.error.includes('check constraint')
  ) {
    return { error: CANCEL_SQL_HINT }
  }

  return result
}

export async function archiveOrder(orderId: string): Promise<{ error: string | null }> {
  const hasArchive = await detectArchiveSupport()
  if (!hasArchive) {
    return {
      error:
        'Arkiva nuk është gati. Në Supabase SQL Editor ekzekuto: ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;',
    }
  }
  return patchOrder(orderId, { archived_at: new Date().toISOString() })
}

export async function restoreOrder(orderId: string): Promise<{ error: string | null }> {
  const hasArchive = await detectArchiveSupport()
  if (!hasArchive) {
    return { error: 'Kolona archived_at mungon. Ekzekuto MIGRATION_V2.sql.' }
  }
  return patchOrder(orderId, { archived_at: null })
}

export async function deleteOrderForever(
  orderId: string
): Promise<{ error: string | null }> {
  if (!supabase) {
    writeDemoOrders(readDemoOrders().filter((o) => o.id !== orderId))
    return { error: null }
  }
  const { error } = await supabase.from('orders').delete().eq('id', orderId)
  return { error: error?.message ?? null }
}

/** Permanently delete archived orders older than 7 days. */
export async function purgeOldArchives(): Promise<{
  removed: number
  error: string | null
}> {
  const cutoff = new Date(Date.now() - ARCHIVE_TTL_MS).toISOString()

  if (!supabase) {
    const before = readDemoOrders()
    const after = before.filter(
      (o) => !o.archived_at || new Date(o.archived_at).getTime() >= Date.now() - ARCHIVE_TTL_MS
    )
    writeDemoOrders(after)
    return { removed: before.length - after.length, error: null }
  }

  const hasArchive = await detectArchiveSupport()
  if (!hasArchive) return { removed: 0, error: null }

  const { data, error } = await supabase
    .from('orders')
    .delete()
    .not('archived_at', 'is', null)
    .lt('archived_at', cutoff)
    .select('id')

  if (error) return { removed: 0, error: error.message }
  return { removed: data?.length ?? 0, error: null }
}

// —— Staff sessions ——

export async function startStaffSession(
  userId: string,
  displayName: string | null
): Promise<{ sessionId: string | null; error: string | null }> {
  const started = new Date().toISOString()

  if (!supabase) {
    const session: StaffSession = {
      id: crypto.randomUUID(),
      user_id: userId,
      display_name: displayName,
      started_at: started,
      ended_at: null,
    }
    writeDemoSessions([session, ...readDemoSessions()])
    sessionStorage.setItem(SESSION_ID_KEY, session.id)
    return { sessionId: session.id, error: null }
  }

  const { data, error } = await supabase
    .from('staff_sessions')
    .insert({
      user_id: userId,
      display_name: displayName,
      started_at: started,
    })
    .select('id')
    .single()

  if (error) {
    // Table may not exist yet
    return { sessionId: null, error: error.message }
  }

  sessionStorage.setItem(SESSION_ID_KEY, data.id as string)
  return { sessionId: data.id as string, error: null }
}

export async function endStaffSession(): Promise<{ error: string | null }> {
  const sessionId = sessionStorage.getItem(SESSION_ID_KEY)
  if (!sessionId) return { error: null }
  const ended = new Date().toISOString()

  if (!supabase) {
    writeDemoSessions(
      readDemoSessions().map((s) =>
        s.id === sessionId ? { ...s, ended_at: ended } : s
      )
    )
    sessionStorage.removeItem(SESSION_ID_KEY)
    return { error: null }
  }

  const { error } = await supabase
    .from('staff_sessions')
    .update({ ended_at: ended })
    .eq('id', sessionId)

  sessionStorage.removeItem(SESSION_ID_KEY)
  return { error: error?.message ?? null }
}

export async function fetchStaffSessions(sinceIso: string): Promise<{
  data: StaffSession[]
  error: string | null
}> {
  if (!supabase) {
    const list = readDemoSessions()
      .filter((s) => new Date(s.started_at).getTime() >= new Date(sinceIso).getTime())
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      )
    return { data: list, error: null }
  }

  const { data, error } = await supabase
    .from('staff_sessions')
    .select('*')
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false })
    .limit(500)

  if (error) return { data: [], error: error.message }
  return { data: (data as StaffSession[]) ?? [], error: null }
}

function friendlyStaffName(
  displayName: string | null | undefined,
  role: string | null | undefined,
  index?: number
): string {
  const n = (displayName || '').trim()
  if (n) return n
  if (role === 'admin') return 'Admin'
  if (typeof index === 'number') return `Punëtor ${index}`
  return 'Punëtor'
}

export async function fetchStaffProfiles(): Promise<{
  data: StaffProfile[]
  error: string | null
}> {
  if (!supabase) {
    return {
      data: [
        {
          id: 'demo-admin',
          email: 'admin@demo.local',
          role: 'admin',
          display_name: 'Admin',
        },
        {
          id: 'demo-worker',
          email: 'worker@demo.local',
          role: 'worker',
          display_name: 'Punëtor 1',
        },
      ],
      error: null,
    }
  }

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, role, display_name')
    .order('role', { ascending: true })

  if (error) return { data: [], error: error.message }

  let workerIdx = 0
  const list: StaffProfile[] = (data ?? []).map((row) => {
    const role = row.role === 'admin' ? 'admin' : 'worker'
    if (role === 'worker') workerIdx += 1
    return {
      id: row.id as string,
      email: '',
      role,
      display_name: friendlyStaffName(
        row.display_name as string | null,
        role,
        role === 'worker' ? workerIdx : undefined
      ),
    }
  })
  return { data: list, error: null }
}

export async function fetchStaffNameMap(): Promise<Record<string, string>> {
  if (!supabase) {
    return {
      'demo-admin': 'Admin',
      'demo-worker': 'Punëtor 1',
    }
  }
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, display_name, role')

  const map: Record<string, string> = {}
  if (error || !data) return map

  let workerIdx = 0
  for (const row of data) {
    const role = row.role as string
    if (role === 'worker' || role === 'barista') workerIdx += 1
    let name = friendlyStaffName(
      row.display_name as string | null,
      role,
      role === 'worker' || role === 'barista' ? workerIdx : undefined
    )
    // Hide legacy “vjetër” labels
    if (/vjetër/i.test(name)) {
      name = role === 'waitress' ? `Kamerier ${workerIdx}` : `Shankist ${workerIdx}`
    }
    map[row.id as string] = name
  }
  return map
}

// —— Analytics ——

export function buildItemSales(orders: Order[]): {
  name: string
  quantity: number
  revenue: number
}[] {
  const map = new Map<string, { quantity: number; revenue: number }>()
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    for (const item of order.items) {
      const prev = map.get(item.name) ?? { quantity: 0, revenue: 0 }
      prev.quantity += item.quantity
      prev.revenue += item.price * item.quantity
      map.set(item.name, prev)
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.quantity - a.quantity)
}

export function buildTableStats(orders: Order[]): {
  table: number
  orders: number
  revenue: number
  cancelled: number
}[] {
  const map = new Map<
    number,
    { orders: number; revenue: number; cancelled: number }
  >()
  for (const o of orders) {
    const prev = map.get(o.table_number) ?? {
      orders: 0,
      revenue: 0,
      cancelled: 0,
    }
    if (o.status === 'cancelled') {
      prev.cancelled += 1
    } else {
      prev.orders += 1
      prev.revenue += Number(o.total)
    }
    map.set(o.table_number, prev)
  }
  return [...map.entries()]
    .map(([table, v]) => ({ table, ...v }))
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
}

export function buildWorkerStats(
  orders: Order[],
  names: Record<string, string>
): {
  userId: string
  name: string
  done: number
  cancelled: number
  revenue: number
  avgSeconds: number | null
}[] {
  type Acc = {
    done: number
    cancelled: number
    revenue: number
    seconds: number[]
  }
  const map = new Map<string, Acc>()

  for (const o of orders) {
    if (!o.completed_by) continue
    if (o.status !== 'done' && o.status !== 'cancelled') continue
    const prev = map.get(o.completed_by) ?? {
      done: 0,
      cancelled: 0,
      revenue: 0,
      seconds: [],
    }
    if (o.status === 'done') {
      prev.done += 1
      prev.revenue += Number(o.total)
      const s = completionSeconds(o)
      if (s !== null) prev.seconds.push(s)
    } else {
      prev.cancelled += 1
    }
    map.set(o.completed_by, prev)
  }

  return [...map.entries()]
    .map(([userId, v]) => ({
      userId,
      name: names[userId] || 'Staf',
      done: v.done,
      cancelled: v.cancelled,
      revenue: v.revenue,
      avgSeconds:
        v.seconds.length === 0
          ? null
          : v.seconds.reduce((a, b) => a + b, 0) / v.seconds.length,
    }))
    .sort((a, b) => b.done - a.done)
}

/** Merge staff list with per-worker stats (zeros for idle staff). */
export function mergeWorkerRoster(
  profiles: StaffProfile[],
  orders: Order[],
  names: Record<string, string>
): {
  userId: string
  name: string
  role: string
  done: number
  cancelled: number
  revenue: number
  avgSeconds: number | null
}[] {
  const stats = buildWorkerStats(orders, names)
  const byId = new Map(stats.map((s) => [s.userId, s]))
  const fromProfiles = profiles.map((p) => {
    const s = byId.get(p.id)
    return {
      userId: p.id,
      name: p.display_name || names[p.id] || (p.role === 'admin' ? 'Admin' : 'Punëtor'),
      role: p.role,
      done: s?.done ?? 0,
      cancelled: s?.cancelled ?? 0,
      revenue: s?.revenue ?? 0,
      avgSeconds: s?.avgSeconds ?? null,
    }
  })
  // Include completers not in profiles (edge case)
  for (const s of stats) {
    if (!fromProfiles.some((p) => p.userId === s.userId)) {
      fromProfiles.push({
        userId: s.userId,
        name: s.name,
        role: 'worker',
        done: s.done,
        cancelled: s.cancelled,
        revenue: s.revenue,
        avgSeconds: s.avgSeconds,
      })
    }
  }
  return fromProfiles.sort((a, b) => b.done - a.done || a.name.localeCompare(b.name))
}

export function ordersByWorker(
  orders: Order[],
  userId: string
): Order[] {
  return orders
    .filter(
      (o) =>
        o.completed_by === userId &&
        (o.status === 'done' || o.status === 'cancelled')
    )
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at).getTime() -
        new Date(a.completed_at || a.created_at).getTime()
    )
}

export function buildPeakHours(orders: Order[]): {
  hour: number
  count: number
  revenue: number
}[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    revenue: 0,
  }))
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const h = new Date(o.created_at).getHours()
    buckets[h]!.count += 1
    buckets[h]!.revenue += Number(o.total)
  }
  return buckets.filter((b) => b.count > 0).sort((a, b) => b.count - a.count)
}

export function ordersToCsv(orders: Order[]): string {
  const header = [
    'id',
    'created_at',
    'completed_at',
    'archived_at',
    'duration_minutes',
    'table_number',
    'status',
    'completed_by',
    'total',
    'items',
    'note',
  ]
  const rows = orders.map((o) => {
    const items = o.items
      .map((i) => `${i.quantity}x ${i.name} @ ${i.price}`)
      .join('; ')
    let duration = ''
    if (o.completed_at) {
      duration = (
        (new Date(o.completed_at).getTime() - new Date(o.created_at).getTime()) /
        60000
      ).toFixed(1)
    }
    const note = (o.note ?? '').replace(/"/g, '""')
    return [
      o.id,
      o.created_at,
      o.completed_at ?? '',
      o.archived_at ?? '',
      duration,
      String(o.table_number),
      o.status,
      o.completed_by ?? '',
      Number(o.total).toFixed(2),
      `"${items.replace(/"/g, '""')}"`,
      `"${note}"`,
    ].join(',')
  })
  return [header.join(','), ...rows].join('\n')
}

export function completionSeconds(order: Order): number | null {
  if (order.status !== 'done' || !order.completed_at) return null
  const ms =
    new Date(order.completed_at).getTime() - new Date(order.created_at).getTime()
  if (ms < 0) return null
  return Math.round(ms / 1000)
}

export function buildSpeedStats(orders: Order[]): {
  count: number
  avgSeconds: number | null
  medianSeconds: number | null
  under5min: number
  under10min: number
  samples: { order: Order; seconds: number }[]
} {
  const samples = orders
    .map((order) => {
      const seconds = completionSeconds(order)
      return seconds === null ? null : { order, seconds }
    })
    .filter((x): x is { order: Order; seconds: number } => x !== null)
    .sort(
      (a, b) =>
        new Date(b.order.completed_at!).getTime() -
        new Date(a.order.completed_at!).getTime()
    )

  if (samples.length === 0) {
    return {
      count: 0,
      avgSeconds: null,
      medianSeconds: null,
      under5min: 0,
      under10min: 0,
      samples: [],
    }
  }

  const secs = samples.map((s) => s.seconds).sort((a, b) => a - b)
  const avg = secs.reduce((a, b) => a + b, 0) / secs.length
  const mid = Math.floor(secs.length / 2)
  const median =
    secs.length % 2 === 0 ? (secs[mid - 1]! + secs[mid]!) / 2 : secs[mid]!

  return {
    count: samples.length,
    avgSeconds: avg,
    medianSeconds: median,
    under5min: secs.filter((s) => s <= 300).length,
    under10min: secs.filter((s) => s <= 600).length,
    samples,
  }
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m < 60) return s === 0 ? `${m} min` : `${m} min ${s}s`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}h ${rm}min`
}

export function sessionDurationSeconds(s: StaffSession): number | null {
  if (!s.ended_at) {
    return Math.max(
      0,
      Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000)
    )
  }
  return Math.max(
    0,
    Math.round(
      (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
    )
  )
}
