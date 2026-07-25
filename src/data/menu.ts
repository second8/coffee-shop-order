import type { MenuCategory } from '../types'

/** Matches the printed "The Summer Menu" card. */
export const SHOP_NAME = 'Pristina Homemade Muffins'
export const MENU_TITLE = 'The Summer Menu'
export const INSTAGRAM = '@pristinahomemademuffins'

/**
 * Prices verified against printed menu photo.
 * Names are Albanian (app is Albanian-only). Brand cocktail names stay international.
 */
export const menu: { categories: MenuCategory[] } = {
  categories: [
    {
      name: 'Kafe',
      items: [
        { name: 'Freddo Espresso', price: 2.5 },
        { name: 'Espresso Tonic', price: 2.5 },
        { name: 'Kafe me akull', price: 2.0 },
        { name: 'Frappe', price: 2.0 },
        { name: 'Affogato', price: 2.5 },
      ],
    },
    {
      name: 'Ëmbëlsira',
      items: [
        { name: 'Tortë greke me akullore karamel', price: 3.0 },
        { name: 'Brownie me akullore vanilje', price: 3.0 },
      ],
    },
    {
      name: 'Limonata',
      items: [
        { name: 'Limonatë klasike', price: 2.0 },
        { name: 'Limonatë mango', price: 2.0 },
        { name: 'Limonatë luleshtrydhe', price: 2.0 },
        { name: 'Limonatë frut pasioni', price: 2.0 },
      ],
    },
    {
      name: 'Pije',
      items: [
        { name: 'Aperol Spritz', price: 4.0 },
        { name: 'Limonatë rosé', price: 3.0 },
        { name: 'Çaj i ftohtë', price: 2.5 },
        { name: 'Vodka Sour frut pasioni', price: 5.0 },
        { name: 'Mimosa', price: 4.0 },
        { name: 'Verë e bardhë / e kuqe', price: 4.0 },
      ],
    },
  ],
}
