export interface MenuItem {
  name: string
  price: number
}

export interface MenuCategory {
  name: string
  items: MenuItem[]
}

/** Line on an order. paid_quantity tracks waitress split / partial payments. */
export interface CartItem {
  name: string
  price: number
  quantity: number
  /** How many units already paid (0..quantity). */
  paid_quantity?: number
}

export type OrderStatus = 'pending' | 'done' | 'cancelled'

export interface Order {
  id: string
  table_number: number
  items: CartItem[]
  total: number
  status: OrderStatus
  created_at: string
  completed_at?: string | null
  completed_by?: string | null
  archived_at?: string | null
  /** Customer or staff note */
  note?: string | null
  /** Fully settled with customer (waitress) */
  paid_at?: string | null
  paid_by?: string | null
}

/**
 * admin — full access + wipe
 * barista / shankisti — kitchen board only
 * waitress / kamerieri — bills, pay/split until paid
 * worker — legacy; treated as barista
 */
export type StaffRole = 'admin' | 'barista' | 'waitress' | 'worker'

export interface StaffProfile {
  id: string
  email: string
  role: StaffRole
  display_name: string | null
  /** Login username without domain, if known */
  username?: string | null
}

export interface StaffSession {
  id: string
  user_id: string
  display_name: string | null
  started_at: string
  ended_at: string | null
}
