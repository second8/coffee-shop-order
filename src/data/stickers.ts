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
  const t = raw.trim().replace(/\s+/g, ' ')
  if (t.length < 2 || t.length > MAX_CLIENT_NAME_LEN) return null
  // Letters, numbers, spaces, common punctuation for business names
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,&'\-/]*$/u.test(t)) return null
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

export function isClientOrder(order: {
  client_name?: string | null
  table_number?: number
}): boolean {
  return Boolean(order.client_name?.trim()) || order.table_number === CLIENT_TABLE_SENTINEL
}

export function orderDestinationLabel(order: {
  client_name?: string | null
  table_number: number
}): string {
  const name = order.client_name?.trim()
  if (name) return name
  return `Tavolina ${order.table_number}`
}

export function orderDestinationKey(order: {
  client_name?: string | null
  table_number: number
}): string {
  const name = order.client_name?.trim()
  if (name) return `c:${name.toLowerCase()}`
  return `t:${order.table_number}`
}
