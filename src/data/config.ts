/** Shop live site — used for QR codes */
export const SITE_URL =
  (typeof window !== 'undefined'
    ? window.location.origin
    : 'https://coffee-shop-order-olive.vercel.app') ||
  'https://coffee-shop-order-olive.vercel.app'

/** Default how many tables have QR stickers (admin can change on stickers page) */
export const TABLE_COUNT = 30

export {
  orderUrlForTable,
  orderUrlForClient,
  CLIENT_MIN_ORDER_EUR,
  CLIENT_TABLE_SENTINEL,
} from './stickers'
