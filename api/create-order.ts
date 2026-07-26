import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import menuJson from '../shared/menu.json'

/**
 * Server-side order insert using service role so customers
 * are not blocked by RLS. Service key stays on the server only.
 * Prices from shared/menu.json (same as frontend).
 */
const MENU: Record<string, number> = {}
for (const cat of menuJson.categories) {
  for (const item of cat.items) {
    MENU[item.name] = item.price
  }
}

const CLIENT_MIN_ORDER = 5
const CLIENT_TABLE = 0
const MAX_TABLE = 100
const MAX_CLIENT_NAME = 48

type CartLine = { name: string; price: number; quantity: number }

function sanitizeClientName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/\s+/g, ' ')
  if (t.length < 2 || t.length > MAX_CLIENT_NAME) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,&'\-/]*$/u.test(t)) return null
  return t
}

function sanitize(
  tableNumber: unknown,
  items: unknown,
  clientNameRaw: unknown
):
  | {
      ok: true
      table: number
      items: CartLine[]
      total: number
      clientName: string | null
    }
  | { ok: false; error: string } {
  const clientName = sanitizeClientName(clientNameRaw)

  if (clientNameRaw != null && clientNameRaw !== '' && !clientName) {
    return { ok: false, error: 'Emri i klientit është i pavlefshëm' }
  }

  let table: number
  if (clientName) {
    table = CLIENT_TABLE
  } else {
    table = Number(tableNumber)
    if (!Number.isInteger(table) || table < 1 || table > MAX_TABLE) {
      return { ok: false, error: 'Numri i tavolinës është i pavlefshëm' }
    }
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    return { ok: false, error: 'Porosia është e pavlefshme' }
  }
  const cleaned: CartLine[] = []
  for (const raw of items) {
    if (!raw || typeof raw.name !== 'string') {
      return { ok: false, error: 'Artikull i pavlefshëm' }
    }
    const price = MENU[raw.name]
    if (price === undefined) {
      return { ok: false, error: `Artikull i panjohur: ${raw.name}` }
    }
    const quantity = Math.floor(Number(raw.quantity))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 20) {
      return { ok: false, error: `Sasi e pavlefshme për ${raw.name}` }
    }
    cleaned.push({ name: raw.name, price, quantity })
  }
  const total = cleaned.reduce((s, i) => s + i.price * i.quantity, 0)
  if (clientName && total < CLIENT_MIN_ORDER) {
    return {
      ok: false,
      error: `Porosia minimale për klient është €${CLIENT_MIN_ORDER.toFixed(2)}`,
    }
  }
  return { ok: true, table, items: cleaned, total, clientName }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({
      error:
        'Server missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL. Add them in Vercel env.',
    })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const sanitized = sanitize(body?.table_number, body?.items, body?.client_name)
  if (!sanitized.ok) {
    res.status(400).json({ error: sanitized.error })
    return
  }

  let note: string | null = null
  if (typeof body?.note === 'string') {
    const t = body.note.trim().replace(/\s+/g, ' ')
    if (t) note = t.slice(0, 280)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Embed client name in note so staff UI works even without client_name column
  let storedNote = note
  if (sanitized.clientName) {
    const tag = `[office:${sanitized.clientName}]`
    storedNote = note ? `${tag} ${note}` : tag
  }

  const row: Record<string, unknown> = {
    table_number: sanitized.table,
    items: sanitized.items,
    total: sanitized.total,
    status: 'pending',
  }
  if (storedNote) row.note = storedNote
  if (sanitized.clientName) row.client_name = sanitized.clientName

  const selectFull =
    'id,table_number,items,total,status,created_at,completed_at,completed_by,archived_at,note,paid_at,paid_by,client_name'

  let { data, error } = await supabase
    .from('orders')
    .insert(row)
    .select(selectFull)
    .single()

  if (error && String(error.message).toLowerCase().includes('client_name')) {
    const { client_name: _c, ...withoutClient } = row
    void _c
    const retry = await supabase
      .from('orders')
      .insert(withoutClient)
      .select(
        'id,table_number,items,total,status,created_at,completed_at,completed_by,archived_at,note,paid_at,paid_by'
      )
      .single()
    data = retry.data
      ? ({ ...retry.data, client_name: sanitized.clientName } as typeof data)
      : retry.data
    error = retry.error
  }

  if (error && note && String(error.message).toLowerCase().includes('note')) {
    const retry = await supabase
      .from('orders')
      .insert({
        table_number: sanitized.table,
        items: sanitized.items,
        total: sanitized.total,
        status: 'pending',
        ...(sanitized.clientName ? { client_name: sanitized.clientName } : {}),
      })
      .select(
        'id,table_number,items,total,status,created_at,completed_at,completed_by'
      )
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  if (!data?.id) {
    res.status(500).json({ error: 'Porosia u krijua por mungon id' })
    return
  }

  res.status(200).json({ data })
}
