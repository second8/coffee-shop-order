/** Shop live site — used for QR codes */
export const SITE_URL =
  (typeof window !== 'undefined'
    ? window.location.origin
    : 'https://coffee-shop-order-olive.vercel.app') ||
  'https://coffee-shop-order-olive.vercel.app'

/** How many tables have QR stickers */
export const TABLE_COUNT = 30

export function orderUrlForTable(
  table: number,
  base = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://coffee-shop-order-olive.vercel.app'
): string {
  return `${base}/order?table=${table}`
}
