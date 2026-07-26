import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { menu } from '../data/menu'
import type { CartItem, Order, StaffProfile, StaffSession } from '../types'

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

  let { data, error } = await supabase
    .from('orders')
    .insert(row)
    .select(
      'id,table_number,items,total,status,created_at,completed_at,completed_by,archived_at,note'
    )
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

  // Staff / manual: single path only (no API) so we never write twice
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

async function orderSelectCols(): Promise<string> {
  const hasArchive = await detectArchiveSupport()
  const hasNote = await detectNoteSupport()
  let cols = ORDER_SELECT_BASE
  if (hasArchive) cols += ',archived_at'
  if (hasNote) cols += ',note'
  return cols
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

  // Drop archive fields if column not migrated yet
  const hasArchive = await detectArchiveSupport()
  const safePatch: Record<string, unknown> = { ...patch }
  if (!hasArchive) {
    delete safePatch.archived_at
  }

  const { error } = await supabase.from('orders').update(safePatch).eq('id', orderId)
  if (!error) return { error: null }

  // Retry with only status if optional columns missing (not for cancelled —
  // that needs the check constraint migration)
  if (
    error.message.includes('completed_at') ||
    error.message.includes('completed_by') ||
    error.message.includes('archived_at')
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
  staffUserId?: string | null
): Promise<{ error: string | null }> {
  const result = await patchOrder(orderId, {
    status: 'cancelled',
    completed_at: new Date().toISOString(),
    completed_by: staffUserId ?? null,
  })

  if (!result.error) return result

  // Constraint still only allows pending|done — need migration
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
    if (role === 'worker') workerIdx += 1
    map[row.id as string] = friendlyStaffName(
      row.display_name as string | null,
      role,
      role === 'worker' ? workerIdx : undefined
    )
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
