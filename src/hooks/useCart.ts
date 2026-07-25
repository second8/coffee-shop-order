import { useCallback, useMemo, useState } from 'react'
import type { CartItem, MenuItem } from '../types'

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([])

  const addItem = useCallback((item: MenuItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.name === item.name)
      if (existing) {
        return prev.map((i) =>
          i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { name: item.name, price: item.price, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((name: string) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.name === name)
      if (!existing) return prev
      if (existing.quantity <= 1) {
        return prev.filter((i) => i.name !== name)
      }
      return prev.map((i) =>
        i.name === name ? { ...i, quantity: i.quantity - 1 } : i
      )
    })
  }, [])

  const setQuantity = useCallback((name: string, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => i.name !== name)
      return prev.map((i) => (i.name === name ? { ...i, quantity } : i))
    })
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const getQuantity = useCallback(
    (name: string) => items.find((i) => i.name === name)?.quantity ?? 0,
    [items]
  )

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  )

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items]
  )

  return {
    items,
    addItem,
    removeItem,
    setQuantity,
    clear,
    getQuantity,
    itemCount,
    total,
  }
}
