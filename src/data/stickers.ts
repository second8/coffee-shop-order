/** Admin-managed sticker registry (tables + named client/office codes). */

export const STICKERS_STORAGE_KEY = 'phm-stickers-v1'
export const DEFAULT_TABLE_COUNT = 30
export const CLIENT_MIN_ORDER_EUR = 5
/** Sentinel table_number for office/client orders in DB. */
export const CLIENT_TABLE_SENTINEL = 0
export const MAX_CLIENT_NAME_LEN = 48

export type ClientSticker = {
  id: string
  name: string
  createdAt: string
}

export type StickersConfig = {
  tableCount: number
  clients: ClientSticker[]
}

export function slugifyClientName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function sanitizeClientName(raw: string): string | null {
  // Keep permissive — Albanian letters, business names, etc.
  const t = raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
  if (t.length < 2 || t.length > MAX_CLIENT_NAME_LEN) return null
  // Reject only pure garbage (URLs, huge symbols)
  if (/^https?:\/\//i.test(t)) return null
  return t
}

export function orderUrlForTable(
  table: number,
  base = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://coffee-shop-order-olive.vercel.app'
): string {
  return `${base}/order?table=${table}`
}

export function orderUrlForClient(
  name: string,
  base = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://coffee-shop-order-olive.vercel.app'
): string {
  return `${base}/order?client=${encodeURIComponent(name)}`
}

export function loadStickersConfig(): StickersConfig {
  try {
    const raw = localStorage.getItem(STICKERS_STORAGE_KEY)
    if (!raw) {
      return { tableCount: DEFAULT_TABLE_COUNT, clients: [] }
    }
    const parsed = JSON.parse(raw) as Partial<StickersConfig>
    const tableCount = Math.min(
      100,
      Math.max(1, Math.floor(Number(parsed.tableCount) || DEFAULT_TABLE_COUNT))
    )
    const clients = Array.isArray(parsed.clients)
      ? parsed.clients
          .filter(
            (c): c is ClientSticker =>
              !!c &&
              typeof c.id === 'string' &&
              typeof c.name === 'string' &&
              !!sanitizeClientName(c.name)
          )
          .map((c) => ({
            id: c.id,
            name: sanitizeClientName(c.name)!,
            createdAt:
              typeof c.createdAt === 'string'
                ? c.createdAt
                : new Date().toISOString(),
          }))
      : []
    return { tableCount, clients }
  } catch {
    return { tableCount: DEFAULT_TABLE_COUNT, clients: [] }
  }
}

export function saveStickersConfig(cfg: StickersConfig): void {
  const tableCount = Math.min(100, Math.max(1, Math.floor(cfg.tableCount)))
  const clients = cfg.clients
    .map((c) => {
      const name = sanitizeClientName(c.name)
      if (!name) return null
      return {
        id: c.id || crypto.randomUUID(),
        name,
        createdAt: c.createdAt || new Date().toISOString(),
      }
    })
    .filter((c): c is ClientSticker => c != null)
  localStorage.setItem(
    STICKERS_STORAGE_KEY,
    JSON.stringify({ tableCount, clients } satisfies StickersConfig)
  )
}

/**
 * Survives if `client_name` column is missing (pre-migration).
 * Human-readable so staff see the name even if parsing fails.
 * Format: "ZYRË: Client Name" optionally followed by " · user note"
 */
export const CLIENT_NOTE_PREFIX_RE = /^ZYRË:\s*(.+?)(?:\s+·\s+([\s\S]*))?$/i
export const CLIENT_NOTE_TAG_RE = /\[office:([^\]]{1,48})\]/i

export function encodeClientInNote(
  clientName: string,
  note: string | null
): string {
  const name = clientName.trim().replace(/\s+/g, ' ')
  // Prefer plain human-readable form (visible on tickets)
  if (note) return `ZYRË: ${name} · ${note}`
  return `ZYRË: ${name}`
}

export function parseClientFromNote(
  note: string | null | undefined
): string | null {
  if (!note) return null
  const plain = note.match(CLIENT_NOTE_PREFIX_RE)
  if (plain?.[1]) {
    const n = sanitizeClientName(plain[1])
    if (n) return n
    // Even if sanitize is picky, trust the captured label
    const fallback = plain[1].trim().replace(/\s+/g, ' ').slice(0, MAX_CLIENT_NAME_LEN)
    if (fallback.length >= 2) return fallback
  }
  const tag = note.match(CLIENT_NOTE_TAG_RE)
  if (tag?.[1]) {
    const n = sanitizeClientName(tag[1])
    if (n) return n
    const fallback = tag[1].trim().replace(/\s+/g, ' ').slice(0, MAX_CLIENT_NAME_LEN)
    if (fallback.length >= 2) return fallback
  }
  return null
}

export function stripClientTagFromNote(
  note: string | null | undefined
): string | null {
  if (!note) return null
  const plain = note.match(CLIENT_NOTE_PREFIX_RE)
  if (plain) {
    const rest = (plain[2] ?? '').trim()
    return rest || null
  }
  const stripped = note
    .replace(CLIENT_NOTE_TAG_RE, '')
    .replace(/^ZYRË:\s*.+?(?:\s+·\s*)?/i, '')
    .trim()
  return stripped || null
}

/** Resolve client/office name from column or embedded note tag. */
export function resolveClientName(order: {
  client_name?: string | null
  note?: string | null
  table_number?: number
  items?: { name?: string }[] | null
}): string | null {
  const direct = order.client_name?.trim()
  if (direct && direct.toLowerCase() !== 'zyrë / klient') return direct
  const fromNote = parseClientFromNote(order.note)
  if (fromNote) return fromNote
  // Last resort: meta line baked into items (see encodeClientAsMetaItem)
  const meta = order.items?.find((i) =>
    typeof i?.name === 'string' && /^ZYRË:\s*.+/i.test(i.name)
  )
  if (meta?.name) {
    const m = meta.name.match(/^ZYRË:\s*(.+)$/i)
    if (m?.[1]) {
      const n = m[1].trim().replace(/\s+/g, ' ').slice(0, MAX_CLIENT_NAME_LEN)
      if (n.length >= 2) return n
    }
  }
  return null
}

/** Meta cart line so name survives even if note + client_name columns fail. */
export function clientMetaItemName(clientName: string): string {
  return `ZYRË: ${clientName.trim().replace(/\s+/g, ' ').slice(0, MAX_CLIENT_NAME_LEN)}`
}

export function isClientMetaItem(name: string): boolean {
  return /^ZYRË:\s*.+/i.test(name)
}

export function isClientOrder(order: {
  client_name?: string | null
  note?: string | null
  table_number?: number
}): boolean {
  return (
    Boolean(resolveClientName(order)) ||
    order.table_number === CLIENT_TABLE_SENTINEL
  )
}

export function orderDestinationLabel(order: {
  client_name?: string | null
  note?: string | null
  table_number: number
}): string {
  const name = resolveClientName(order)
  if (name) return name
  if (order.table_number === CLIENT_TABLE_SENTINEL) return 'ZYRË / Klient'
  return `Tavolina ${order.table_number}`
}

export function orderDestinationKey(order: {
  client_name?: string | null
  note?: string | null
  table_number: number
}): string {
  const name = resolveClientName(order)
  if (name) return `c:${name.toLowerCase()}`
  if (order.table_number === CLIENT_TABLE_SENTINEL) return 'c:__unknown__'
  return `t:${order.table_number}`
}

/** Hydrate client_name from note/meta; clean note + hide meta line from tickets. */
export function normalizeOrderClientFields<
  T extends {
    client_name?: string | null
    note?: string | null
    table_number: number
    items?: { name: string; price: number; quantity: number; paid_quantity?: number }[]
  },
>(order: T): T {
  const name = resolveClientName(order)
  const items = Array.isArray(order.items)
    ? order.items.filter((i) => !isClientMetaItem(i.name))
    : order.items
  if (!name) {
    if (items !== order.items) return { ...order, items }
    return order
  }
  return {
    ...order,
    client_name: name,
    note: stripClientTagFromNote(order.note),
    items,
    table_number: CLIENT_TABLE_SENTINEL,
  }
}
