import type { MenuCategory } from '../types'
import menuJson from '../../shared/menu.json'

/** Matches the printed "The Summer Menu" card. Single source: shared/menu.json */
export const SHOP_NAME = menuJson.shopName
export const MENU_TITLE = menuJson.menuTitle
export const INSTAGRAM = menuJson.instagram

/**
 * Item & category names in English (as on the printed menu).
 * App chrome (buttons, labels) stays Albanian.
 */
export const menu: { categories: MenuCategory[] } = {
  categories: menuJson.categories as MenuCategory[],
}

/** Price map for server-side and client validation */
export function menuPriceMap(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const cat of menu.categories) {
    for (const item of cat.items) {
      map[item.name] = item.price
    }
  }
  return map
}
