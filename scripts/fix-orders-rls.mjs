/**
 * Recreate orders RLS so anonymous customers can INSERT.
 * Requires SUPABASE_SERVICE_ROLE_KEY + project URL.
 *
 * Uses Supabase Management-less approach: create a temporary SQL function
 * is not available. We apply policies via the Postgres REST workaround:
 * insert through service role can't change policies.
 *
 * This script documents the SQL and tests anon insert after you run SQL.
 * If DATABASE_URL is set, it runs the SQL directly.
 */
import pg from 'pg'

const url = process.env.VITE_SUPABASE_URL || 'https://xdqigvsgmutjimzddwqi.supabase.co'
const service =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  ''
const anon =
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ''

const sql = `
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous inserts" ON orders;
CREATE POLICY "Allow anonymous inserts"
  ON orders FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated inserts" ON orders;
CREATE POLICY "Allow authenticated inserts"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can read orders" ON orders;
DROP POLICY IF EXISTS "Allow read orders" ON orders;
CREATE POLICY "Staff can read orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff can update orders" ON orders;
DROP POLICY IF EXISTS "Allow update status" ON orders;
CREATE POLICY "Staff can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Optional: allow service role unrestricted (always true for service_role)
`

async function testAnonInsert() {
  const headers = {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }
  const res = await fetch(`${url}/rest/v1/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      table_number: 98,
      items: [{ name: 'RLS Test', price: 1, quantity: 1 }],
      total: 1,
      status: 'pending',
    }),
  })
  console.log('anon insert test:', res.status, await res.text())
  return res.ok
}

if (databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('SQL applied via DATABASE_URL')
} else {
  console.log('No DATABASE_URL — cannot apply policies from here.')
  console.log('Run this SQL in Supabase SQL Editor:\n')
  console.log(sql)
}

if (anon) {
  await testAnonInsert()
}
