/**
 * Optional: test anon insert after you run supabase/FIX_ORDERS_RLS.sql
 * Usage:
 *   set VITE_SUPABASE_URL=...
 *   set VITE_SUPABASE_ANON_KEY=...
 *   node scripts/apply-rls-fix.mjs
 */
const url = process.env.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.log('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then re-run.')
  console.log('Also run supabase/FIX_ORDERS_RLS.sql in the SQL Editor if inserts fail.')
  process.exit(1)
}

const res = await fetch(`${url}/rest/v1/orders`, {
  method: 'POST',
  headers: {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: JSON.stringify({
    table_number: 97,
    items: [{ name: 'Iced Coffee', price: 2, quantity: 1 }],
    total: 2,
    status: 'pending',
  }),
})
console.log('anon insert:', res.status, await res.text())
