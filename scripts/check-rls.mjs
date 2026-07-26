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
const policies = await client.query(`
  select pol.polname, pol.polcmd::text,
         pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
         pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr,
         pol.polroles::regrole[] as roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  where c.relname = 'orders'
`)
console.log(JSON.stringify(policies.rows, null, 2))
const rls = await client.query(
  `select relrowsecurity from pg_class where relname = 'orders'`
)
console.log('rls enabled', rls.rows)
await client.end()
