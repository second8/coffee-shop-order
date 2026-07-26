import fs from 'fs'
import pg from 'pg'

function loadEnv() {
  try {
    const raw = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i < 0) continue
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim()
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    // ignore
  }
}

loadEnv()

const cs =
  process.env.DATABASE_URL ||
  (process.env.SUPABASE_DB_PASSWORD
    ? `postgresql://postgres.xdqigvsgmutjimzddwqi:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
    : null)

if (!cs) {
  console.error('Set DATABASE_URL or SUPABASE_DB_PASSWORD in .env')
  process.exit(1)
}

const c = new pg.Client({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
})

await c.connect()
const r = await c.query(`
  SELECT tablename, policyname
  FROM pg_policies
  WHERE tablename IN ('staff_profiles', 'staff_sessions')
  ORDER BY 1, 2
`)
console.log(r.rows)
await c.end()
console.log('DB_OK')
