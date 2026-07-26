import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
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

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: node scripts/run-sql.mjs supabase/FILE.sql')
  process.exit(1)
}

const sql = fs.readFileSync(path.join(root, sqlFile), 'utf8')
const pw = process.env.SUPABASE_DB_PASSWORD || 'premtimprep'
const candidates = [
  process.env.DATABASE_URL,
  `postgresql://postgres:${encodeURIComponent(pw)}@db.xdqigvsgmutjimzddwqi.supabase.co:5432/postgres`,
  `postgresql://postgres.xdqigvsgmutjimzddwqi:${encodeURIComponent(pw)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.xdqigvsgmutjimzddwqi:${encodeURIComponent(pw)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
].filter(Boolean)

let lastErr = null
for (const cs of candidates) {
  const client = new pg.Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  })
  try {
    await client.connect()
    console.log('Connected')
    await client.query(sql)
    console.log('OK', sqlFile)
    await client.end()
    process.exit(0)
  } catch (e) {
    lastErr = e
    console.log('try fail:', String(e.message).slice(0, 120))
    try {
      await client.end()
    } catch {
      // ignore
    }
  }
}
console.error('All connection attempts failed', lastErr?.message)
process.exit(1)
