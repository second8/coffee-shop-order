export interface MenuItem {
  name: string
  price: number
}

export interface MenuCategory {
  name: string
  items: MenuItem[]
}

export interface CartItem {
  name: string
  price: number
  quantity: number
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
  /** Customer or staff note (add/remove requests, allergies, etc.) */
  note?: string | null
}

export type StaffRole = 'admin' | 'worker'

export interface StaffProfile {
  id: string
  email: string
  role: StaffRole
  display_name: string | null
}

export interface StaffSession {
  id: string
  user_id: string
  display_name: string | null
  started_at: string
  ended_at: string | null
}
