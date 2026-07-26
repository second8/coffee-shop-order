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

await client.query(`
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT INSERT ON TABLE public.orders TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
  GRANT ALL ON TABLE public.orders TO service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
`)

const priv = await client.query(`
  select
    has_table_privilege('anon', 'public.orders', 'INSERT') as anon_insert,
    has_table_privilege('anon', 'public.orders', 'SELECT') as anon_select,
    has_table_privilege('authenticated', 'public.orders', 'SELECT') as auth_select
`)
console.log(priv.rows[0])
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
console.log('js', r.error?.message || 'ok', r.data)

// Note: .select after insert needs SELECT privilege for anon!
// That's likely why it failed — PostgREST returns the row with select
if (r.error) {
  const r2 = await sb.from('orders').insert({
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
  console.log('js no select', r2.error?.message || 'ok', r2.status, r2.data)
}

if (r.data?.id) {
  const del = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  await del.from('orders').delete().eq('id', r.data.id)
  console.log('cleaned')
}
