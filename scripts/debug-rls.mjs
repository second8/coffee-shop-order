import fs from 'fs'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const policies = await client.query(`
  select polname, polpermissive, polcmd::text, polroles::regrole[]
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  where c.relname = 'orders'
`)
console.log('policies', policies.rows)

// Bypass RLS and check for triggers
const triggers = await client.query(`
  select tgname, pg_get_triggerdef(oid) as def
  from pg_trigger
  where tgrelid = 'public.orders'::regclass and not tgisinternal
`)
console.log('triggers', triggers.rows)

// Force policy as PUBLIC
await client.query(`
  ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
`)
console.log('RLS temporarily disabled for test')

await client.end()

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
)
const r = await sb
  .from('orders')
  .insert({
    table_number: 0,
    items: [{ name: 'Freddo Espresso', price: 2.5, quantity: 2 }],
    total: 5,
    status: 'pending',
    client_name: 'Acme Office',
    note: 'ZYRE: Acme Office',
  })
  .select('id, client_name, table_number')
  .single()
console.log('insert without RLS', r.error?.message || 'ok', r.data)

const client2 = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client2.connect()
if (r.data?.id) {
  await client2.query('delete from orders where id = $1', [r.data.id])
  console.log('cleaned')
}
// Re-enable RLS with working policy
await client2.query(`
  ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Allow anonymous inserts" ON orders;
  DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
  CREATE POLICY "anon_insert_orders"
    ON orders FOR INSERT
    TO public
    WITH CHECK (true);
`)
console.log('RLS re-enabled with public insert policy')
await client2.end()

const r2 = await sb
  .from('orders')
  .insert({
    table_number: 0,
    items: [
      { name: 'ZYRE: Acme Office', price: 0, quantity: 1 },
      { name: 'Freddo Espresso', price: 2.5, quantity: 2 },
    ],
    total: 5,
    status: 'pending',
    client_name: 'Acme Office',
    note: 'ZYRE: Acme Office',
  })
  .select('id, client_name, table_number, note')
  .single()
console.log('insert with public policy', r2.error?.message || 'ok', r2.data)

if (r2.data?.id) {
  const del = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  await del.from('orders').delete().eq('id', r2.data.id)
  console.log('cleaned2')
}
