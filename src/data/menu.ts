import type { MenuCategory } from '../types'

export const SHOP_NAME = 'Café Sol'

export const menu: { categories: MenuCategory[] } = {
  categories: [
    {
      name: 'Coffee',
      items: [
        { name: 'Freddo Espresso', price: 2.5 },
        { name: 'Espresso Tonic', price: 2.5 },
        { name: 'Iced Coffee', price: 2.0 },
        { name: 'Frappe', price: 2.0 },
        { name: 'Affogato', price: 2.5 },
      ],
    },
    {
      name: 'Desserts',
      items: [
        { name: 'Greek cake with caramel ice cream', price: 3.0 },
        { name: 'Brownie with vanilla ice cream', price: 3.0 },
      ],
    },
    {
      name: 'Lemonades',
      items: [
        { name: 'Classic Lemonade', price: 2.0 },
        { name: 'Mango Lemonade', price: 2.0 },
        { name: 'Strawberry Lemonade', price: 2.0 },
        { name: 'Passion Fruit Lemonade', price: 2.0 },
      ],
    },
    {
      name: 'Drinks',
      items: [
        { name: 'Aperol Spritz', price: 4.0 },
        { name: 'Rosé Lemonade', price: 3.0 },
        { name: 'Fresh Iced Tea', price: 2.5 },
        { name: 'Vodka Sour Passion Fruit', price: 5.0 },
        { name: 'Mimosa', price: 4.0 },
        { name: 'Wine (red/white)', price: 4.0 },
      ],
    },
  ],
}
