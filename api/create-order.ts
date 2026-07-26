import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load menu without JSON module import (more reliable on Vercel)
function loadMenu(): Record<string, number> {
  try {
    const p = join(process.cwd(), 'shared', 'menu.json')
    const raw = JSON.parse(readFileSync(p, 'utf8')) as {
      categories: { items: { name: string; price: number }[] }[]
    }
    const map: Record<string, number> = {}
    for (const cat of raw.categories) {
      for (const item of cat.items) map[item.name] = item.price
    }
    return map
  } catch {
    return {}
  }
}

const MENU = loadMenu()
const CLIENT_MIN_ORDER = 5
const CLIENT_TABLE = 0
const MAX_TABLE = 100

type CartLine = { name: string; price: number; quantity: number }

function cleanClientName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/\s+/g, ' ').slice(0, 48)
  return t.length >= 2 ? t : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const supabaseUrl =
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!supabaseUrl || !serviceKey) {
      res.status(500).json({ error: 'Server missing Supabase env vars' })
      return
    }

    if (Object.keys(MENU).length === 0) {
      res.status(500).json({ error: 'Menu failed to load on server' })
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const clientName = cleanClientName(body?.client_name)

    if (!Array.isArray(body?.items) || body.items.length === 0) {
      res.status(400).json({ error: 'Porosia eshte e pavlefshme' })
      return
    }

    const items: CartLine[] = []
    for (const raw of body.items) {
      if (!raw || typeof raw.name !== 'string') {
        res.status(400).json({ error: 'Artikull i pavlefshem' })
        return
      }
      if (/^ZYR[EË]:/i.test(raw.name)) continue
      const price = MENU[raw.name]
      if (price === undefined) {
        res.status(400).json({ error: 'Artikull i panjohur: ' + raw.name })
        return
      }
      const quantity = Math.floor(Number(raw.quantity))
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 20) {
        res.status(400).json({ error: 'Sasi e pavlefshme' })
        return
      }
      items.push({ name: raw.name, price, quantity })
    }
    if (items.length === 0) {
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
        error: 'Porosia minimale per klient eshte EUR ' + CLIENT_MIN_ORDER,
      })
      return
    }

    let userNote: string | null = null
    if (typeof body?.note === 'string') {
      const t = body.note
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^ZYR[EË]:\s*.+?(?:\s+[·•]\s*)?/i, '')
        .trim()
      if (t) userNote = t.slice(0, 280)
    }

    const lineItems: CartLine[] = clientName
      ? [{ name: 'ZYRE: ' + clientName, price: 0, quantity: 1 }, ...items]
      : items
    const note = clientName
      ? userNote
        ? 'ZYRE: ' + clientName + ' · ' + userNote
        : 'ZYRE: ' + clientName
      : userNote

    const id = crypto.randomUUID()
    const created_at = new Date().toISOString()
    const fullRow: Record<string, unknown> = {
      id,
      table_number: table,
      items: lineItems,
      total,
      status: 'pending',
      created_at,
    }
    if (note) fullRow.note = note
    if (clientName) fullRow.client_name = clientName

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let error: { message: string } | null = null
    {
      const r = await supabase.from('orders').insert(fullRow)
      error = r.error
    }
    if (error && /client_name/i.test(error.message)) {
      const { client_name: _c, ...rest } = fullRow
      void _c
      const r = await supabase.from('orders').insert(rest)
      error = r.error
    }
    if (error && /note/i.test(error.message)) {
      const r = await supabase.from('orders').insert({
        id,
        table_number: table,
        items: lineItems,
        total,
        status: 'pending',
        created_at,
      })
      error = r.error
    }

    if (error) {
      res.status(400).json({ error: error.message })
      return
    }

    res.status(200).json({
      data: {
        id,
        table_number: table,
        items: lineItems,
        total,
        status: 'pending',
        created_at,
        note,
        client_name: clientName,
      },
    })
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Server error',
    })
  }
}
