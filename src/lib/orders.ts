import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { menu } from '../data/menu'
import type { CartItem, Order } from '../types'

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

/** Local demo store when Supabase is not configured — same browser, full flow works. */
const DEMO_KEY = 'cafe-sol-demo-orders'
const DEMO_EVENT = 'cafe-sol-demo-orders-changed'

const MAX_TABLE = 100
const MAX_QTY_PER_ITEM = 20
const MAX_LINES = 30

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

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Sanitize cart against the real menu so clients cannot invent items or prices. */
export function sanitizeOrderInput(
  tableNumber: number,
  items: CartItem[]
): { items: CartItem[]; total: number; error: string | null } {
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > MAX_TABLE) {
    return { items: [], total: 0, error: 'Invalid table number' }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], total: 0, error: 'Order is empty' }
  }

  if (items.length > MAX_LINES) {
    return { items: [], total: 0, error: 'Too many items in one order' }
  }

  const cleaned: CartItem[] = []
  for (const raw of items) {
    if (!raw || typeof raw.name !== 'string') {
      return { items: [], total: 0, error: 'Invalid item' }
    }
    const price = menuPriceByName.get(raw.name)
    if (price === undefined) {
      return { items: [], total: 0, error: `Unknown item: ${raw.name}` }
    }
    const quantity = Math.floor(Number(raw.quantity))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QTY_PER_ITEM) {
      return { items: [], total: 0, error: `Invalid quantity for ${raw.name}` }
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

export async function createOrder(
  tableNumber: number,
  items: CartItem[],
  _total: number
): Promise<{ data: Order | null; error: string | null }> {
  const sanitized = sanitizeOrderInput(tableNumber, items)
  if (sanitized.error) {
    return { data: null, error: sanitized.error }
  }

  if (!supabase) {
    const order: Order = {
      id: crypto.randomUUID(),
      table_number: tableNumber,
      items: sanitized.items,
      total: sanitized.total,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    const all = readDemoOrders()
    writeDemoOrders([order, ...all])
    return { data: order, error: null }
  }

  const { data, error } = await supabase
    .from('orders')
    .insert({
      table_number: tableNumber,
      items: sanitized.items,
      total: sanitized.total,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as Order, error: null }
}

export async function fetchTodayOrders(): Promise<{
  data: Order[]
  error: string | null
}> {
  return fetchOrdersSince(startOfLocalDay().toISOString())
}

/** Fetch orders from a given ISO timestamp (inclusive). Used for sales history. */
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

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data as Order[]) ?? [], error: null }
}

export async function markOrderDone(
  orderId: string
): Promise<{ error: string | null }> {
  if (!supabase) {
    const all = readDemoOrders().map((o) =>
      o.id === orderId ? { ...o, status: 'done' as const } : o
    )
    writeDemoOrders(all)
    return { error: null }
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'done' })
    .eq('id', orderId)

  return { error: error?.message ?? null }
}

export function buildItemSales(orders: Order[]): {
  name: string
  quantity: number
  revenue: number
}[] {
  const map = new Map<string, { quantity: number; revenue: number }>()
  for (const order of orders) {
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

export function ordersToCsv(orders: Order[]): string {
  const header = [
    'id',
    'created_at',
    'table_number',
    'status',
    'total',
    'items',
  ]
  const rows = orders.map((o) => {
    const items = o.items
      .map((i) => `${i.quantity}x ${i.name} @ ${i.price}`)
      .join('; ')
    return [
      o.id,
      o.created_at,
      String(o.table_number),
      o.status,
      Number(o.total).toFixed(2),
      `"${items.replace(/"/g, '""')}"`,
    ].join(',')
  })
  return [header.join(','), ...rows].join('\n')
}

