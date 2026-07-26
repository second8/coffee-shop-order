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

// Check constraints on orders
const cons = await client.query(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.orders'::regclass
`)
console.log('constraints', cons.rows)

/**
 * Customers only need INSERT (via anon).
 * Staff SELECT/UPDATE via authenticated + policies.
 * Service role bypasses RLS for API.
 *
 * If INSERT policies keep failing for anon in this project,
 * keep RLS ON for SELECT/UPDATE/DELETE but allow insert with a
 * policy that uses (true) for the anon role specifically via SET.
 */
await client.query(`
  -- Hard reset insert path
  DROP POLICY IF EXISTS orders_insert_anyone ON orders;
  DROP POLICY IF EXISTS "Allow anonymous inserts" ON orders;
  DROP POLICY IF EXISTS "Allow authenticated inserts" ON orders;
  DROP POLICY IF EXISTS anon_insert_orders ON orders;

  CREATE POLICY orders_anon_insert
    ON orders FOR INSERT TO anon
    WITH CHECK (true);

  CREATE POLICY orders_auth_insert
    ON orders FOR INSERT TO authenticated
    WITH CHECK (true);

  -- Anon must NOT read all orders
  REVOKE ALL ON TABLE orders FROM anon;
  GRANT INSERT ON TABLE orders TO anon;

  -- Authenticated staff
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orders TO authenticated;
`)

// Also try setting role and testing from SQL
const test = await client.query(`
  SET LOCAL ROLE anon;
  SET request.jwt.claim.role = 'anon';
`)
void test

try {
  const asAnon = await client.query(`
    INSERT INTO orders (table_number, items, total, status, client_name, note)
    VALUES (
      0,
      '[{"name":"Freddo Espresso","price":2.5,"quantity":2}]'::jsonb,
      5,
      'pending',
      'Acme Office',
      'ZYRE: Acme Office'
    )
    RETURNING id, client_name, table_number
  `)
  console.log('sql as session insert', asAnon.rows[0])
  await client.query('DELETE FROM orders WHERE id = $1', [asAnon.rows[0].id])
} catch (e) {
  console.log('sql insert fail', e.message)
}

await client.query('RESET ROLE')
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
console.log('js anon', r.error?.message || 'ok', r.data)

if (r.data?.id) {
  const del = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  await del.from('orders').delete().eq('id', r.data.id)
  console.log('cleaned')
}
