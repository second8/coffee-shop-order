const ref = 'xdqigvsgmutjimzddwqi'
const service =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkcWlndnNnbXV0amltemRkd3FpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDk4OTY2OCwiZXhwIjoyMTAwNTY1NjY4fQ.ldCJu1kfcA0VWjT-YnNUQtpyxLcuxDjeBjpdFND1Xwc'
const anon =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkcWlndnNnbXV0amltemRkd3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODk2NjgsImV4cCI6MjEwMDU2NTY2OH0.3RCn-j9GrqGEiHiFzpL0Z8Jc7Jjqr0iNssUNz_a86xM'

const sql = `
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON orders;
CREATE POLICY "Allow anonymous inserts" ON orders FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated inserts" ON orders;
CREATE POLICY "Allow authenticated inserts" ON orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow read orders" ON orders;
DROP POLICY IF EXISTS "Staff can read orders" ON orders;
CREATE POLICY "Staff can read orders" ON orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow update status" ON orders;
DROP POLICY IF EXISTS "Staff can update orders" ON orders;
CREATE POLICY "Staff can update orders" ON orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
`

const headers = {
  apikey: service,
  Authorization: `Bearer ${service}`,
  'Content-Type': 'application/json',
}

const attempts = [
  { url: `https://${ref}.supabase.co/pg/query`, body: { query: sql } },
  { url: `https://${ref}.supabase.co/pg-meta/default/query`, body: { query: sql } },
  { url: `https://api.supabase.com/v1/projects/${ref}/database/query`, body: { query: sql } },
  {
    url: `https://${ref}.supabase.co/rest/v1/rpc/apply_sql`,
    body: { query: sql },
  },
]

for (const a of attempts) {
  try {
    const res = await fetch(a.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(a.body),
    })
    const text = await res.text()
    console.log(a.url, res.status, text.slice(0, 250))
  } catch (e) {
    console.log(a.url, 'ERR', e.message)
  }
}

// test anon after
const test = await fetch(`https://${ref}.supabase.co/rest/v1/orders`, {
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
console.log('anon test after:', test.status, await test.text())
