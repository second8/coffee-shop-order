import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
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
  total: number
): Promise<{ data: Order | null; error: string | null }> {
  if (!supabase) {
    const order: Order = {
      id: crypto.randomUUID(),
      table_number: tableNumber,
      items,
      total,
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
      items,
      total,
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
  if (!supabase) {
    const today = readDemoOrders().filter((o) => isToday(o.created_at))
    today.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return { data: today, error: null }
  }

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false })

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
