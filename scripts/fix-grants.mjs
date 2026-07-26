import fs from 'fs'
import pg from 'pg'

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

// Fix grants + RLS insert for customers
await client.query(`
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT SELECT, INSERT ON TABLE orders TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orders TO authenticated;
  GRANT ALL ON TABLE orders TO service_role;

  DROP POLICY IF EXISTS "Allow anonymous inserts" ON orders;
  CREATE POLICY "Allow anonymous inserts"
    ON orders FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

  -- Customers need no SELECT; staff SELECT already exists
`)

console.log('grants + policy applied')

// Verify as check
const grants = await client.query(`
  select grantee, privilege_type
  from information_schema.role_table_grants
  where table_name = 'orders'
  order by grantee, privilege_type
`)
console.log(grants.rows)
await client.end()
