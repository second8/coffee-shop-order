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

// Drop all insert policies and recreate broadly
await client.query(`
  DO $$
  DECLARE r record;
  BEGIN
    FOR r IN
      SELECT policyname FROM pg_policies WHERE tablename = 'orders' AND cmd = 'INSERT'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON orders', r.policyname);
    END LOOP;
  END $$;

  CREATE POLICY orders_insert_anyone
    ON orders
    FOR INSERT
    WITH CHECK (true);

  -- Ensure SELECT for staff stays
  -- (leave other policies)
`)

const pol = await client.query(`
  select policyname, roles, cmd, qual, with_check
  from pg_policies where tablename = 'orders'
`)
console.log(pol.rows)
await client.end()

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
)

// Decode JWT role
const payload = JSON.parse(
  Buffer.from(
    process.env.VITE_SUPABASE_ANON_KEY.split('.')[1],
    'base64url'
  ).toString()
)
console.log('anon jwt role', payload.role)

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
console.log('result', r.error?.message || 'ok', r.data)

if (r.data?.id) {
  const del = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  await del.from('orders').delete().eq('id', r.data.id)
  console.log('cleaned')
}
