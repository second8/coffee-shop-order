import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import menuJson from '../shared/menu.json'

const MENU: Record<string, number> = {}
for (const cat of menuJson.categories as { items: { name: string; price: number }[] }[]) {
  for (const item of cat.items) {
    MENU[item.name] = item.price
  }
}

const CLIENT_MIN_ORDER = 5
const CLIENT_TABLE = 0
const MAX_TABLE = 100
const MAX_CLIENT_NAME = 48

type CartLine = { name: string; price: number; quantity: number }

function cleanClientName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_CLIENT_NAME)
  if (t.length < 2) return null
  return t
}

function cleanItems(items: unknown): CartLine[] | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) return null
  const cleaned: CartLine[] = []
  for (const raw of items) {
    if (!raw || typeof raw.name !== 'string') return null
    // Skip any pre-baked destination meta lines
    if (/^ZYR[EË]:\s*/i.test(raw.name) || /^\[office:/i.test(raw.name)) continue
    const price = MENU[raw.name]
    if (price === undefined) return null
    const quantity = Math.floor(Number(raw.quantity))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 20) return null
    cleaned.push({ name: raw.name, price, quantity })
  }
  return cleaned.length ? cleaned : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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
    const clientName = cleanClientName(body?.client_name)
    const items = cleanItems(body?.items)
    if (!items) {
      res.status(400).json({ error: 'Porosia eshte e pavlefshme' })
      return
    }

    let table: number
    if (clientName) {
      table = CLIENT_TABLE
    } else {
      table = Number(body?.table_number)
      if (!Number.isInteger(table) || table < 1 || table > MAX_TABLE) {
        res.status(400).json({ error: 'Numri i tavolines eshte i pavlefshem' })
        return
      }
    }

    const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
    if (clientName && total < CLIENT_MIN_ORDER) {
      res.status(400).json({
        error: `Porosia minimale per klient eshte EUR ${CLIENT_MIN_ORDER}`,
      })
      return
    }

    let userNote: string | null = null
    if (typeof body?.note === 'string') {
      const t = body.note
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^ZYR[EË]:\s*.+?(?:\s+[·•]\s*)?/i, '')
        .replace(/\[office:[^\]]*\]\s*/gi, '')
        .trim()
      if (t) userNote = t.slice(0, 280)
    }

    // Always persist the sticker name in 3 places
    const lineItems: CartLine[] = clientName
      ? [{ name: `ZYRE: ${clientName}`, price: 0, quantity: 1 }, ...items]
      : items
    const note = clientName
      ? userNote
        ? `ZYRE: ${clientName} · ${userNote}`
        : `ZYRE: ${clientName}`
      : userNote

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const fullRow: Record<string, unknown> = {
      table_number: table,
      items: lineItems,
      total,
      status: 'pending',
    }
    if (note) fullRow.note = note
    if (clientName) fullRow.client_name = clientName

    // Try with client_name, then without if column missing
    let data: Record<string, unknown> | null = null
    let error: { message: string } | null = null

    {
      const r = await supabase
        .from('orders')
        .insert(fullRow)
        .select(
          'id,table_number,items,total,status,created_at,completed_at,completed_by,note,client_name'
        )
        .single()
      data = r.data as Record<string, unknown> | null
      error = r.error
    }

    if (error && /client_name/i.test(error.message)) {
      const { client_name: _c, ...rest } = fullRow
      void _c
      const r = await supabase
        .from('orders')
        .insert(rest)
        .select(
          'id,table_number,items,total,status,created_at,completed_at,completed_by,note'
        )
        .single()
      data = r.data as Record<string, unknown> | null
      error = r.error
      if (!error && data && clientName) data.client_name = clientName
    }

    if (error && /note/i.test(error.message)) {
      const r = await supabase
        .from('orders')
        .insert({
          table_number: table,
          items: lineItems,
          total,
          status: 'pending',
          ...(clientName ? { client_name: clientName } : {}),
        })
        .select(
          'id,table_number,items,total,status,created_at,completed_at,completed_by'
        )
        .single()
      data = r.data as Record<string, unknown> | null
      error = r.error
      if (!error && data && clientName) {
        data.client_name = clientName
        data.note = note
      }
    }

    if (error) {
      // Absolute last resort: bare row still carries name in items
      const r = await supabase
        .from('orders')
        .insert({
          table_number: table,
          items: lineItems,
          total,
          status: 'pending',
        })
        .select(
          'id,table_number,items,total,status,created_at,completed_at,completed_by'
        )
        .single()
      data = r.data as Record<string, unknown> | null
      error = r.error
      if (!error && data && clientName) {
        data.client_name = clientName
        data.note = note
      }
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    res.status(500).json({ error: msg })
  }
}
