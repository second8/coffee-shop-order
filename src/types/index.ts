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

export type OrderStatus = 'pending' | 'done'

export interface Order {
  id: string
  table_number: number
  items: CartItem[]
  total: number
  status: OrderStatus
  created_at: string
}
