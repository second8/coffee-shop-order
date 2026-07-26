/**
 * Create / update staff with simple usernames + roles.
 * Usage (from project root, .env with SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/setup-staff.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env')
try {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

const url =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://xdqigvsgmutjimzddwqi.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

const DOMAIN = 'pristinamuffins.local'

/** Simple logins for two monitors + admin */
const staff = [
  {
    username: 'admin',
    email: 'contact@secondeight.net',
    password: null, // do not reset admin password
    name: 'Pronari',
    role: 'admin',
  },
  {
    username: 'shankisti1',
    email: `shankisti1@${DOMAIN}`,
    password: 'kafe11',
    name: 'Shankist 1',
    role: 'barista',
  },
  {
    username: 'shankisti2',
    email: `shankisti2@${DOMAIN}`,
    password: 'kafe22',
    name: 'Shankist 2',
    role: 'barista',
  },
  {
    username: 'kamerieri1',
    email: `kamerieri1@${DOMAIN}`,
    password: 'fature11',
    name: 'Kamerier 1',
    role: 'waitress',
  },
  {
    username: 'kamerieri2',
    email: `kamerieri2@${DOMAIN}`,
    password: 'fature22',
    name: 'Kamerier 2',
    role: 'waitress',
  },
]

async function listUsers() {
  const all = []
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `${url}/auth/v1/admin/users?page=${page}&per_page=100`,
      { headers }
    )
    const body = await res.json()
    const users = body.users || []
    all.push(...users)
    if (users.length < 100) break
  }
  return all
}

async function upsertUser(s, existing) {
  const byEmail = existing.find(
    (u) => (u.email || '').toLowerCase() === s.email.toLowerCase()
  )

  if (!byEmail) {
    if (!s.password) {
      console.log('SKIP create (no password)', s.email)
      return null
    }
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: s.email,
        password: s.password,
        email_confirm: true,
        app_metadata: { role: s.role },
        user_metadata: { display_name: s.name, username: s.username },
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      console.log('CREATE FAIL', s.username, body)
      return null
    }
    console.log('CREATED', s.username, s.role)
    return body.id || body.user?.id
  }

  const patch = {
    app_metadata: { ...(byEmail.app_metadata || {}), role: s.role },
    user_metadata: {
      ...(byEmail.user_metadata || {}),
      display_name: s.name,
      username: s.username,
    },
  }
  if (s.password) patch.password = s.password

  const res = await fetch(`${url}/auth/v1/admin/users/${byEmail.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(patch),
  })
  console.log(
    res.ok ? 'UPDATED' : 'UPDATE FAIL',
    s.username,
    s.role,
    res.ok ? '' : await res.text()
  )
  return byEmail.id
}

async function upsertProfile(id, s) {
  if (!id) return
  const res = await fetch(`${url}/rest/v1/staff_profiles`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id,
      role: s.role,
      display_name: s.name,
    }),
  })
  // upsert via on_conflict
  if (!res.ok) {
    const res2 = await fetch(
      `${url}/rest/v1/staff_profiles?id=eq.${id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: s.role, display_name: s.name }),
      }
    )
    console.log(
      res2.ok ? 'PROFILE' : 'PROFILE FAIL',
      s.username,
      res2.ok ? '' : await res2.text()
    )
  } else {
    console.log('PROFILE', s.username)
  }
}

const users = await listUsers()
console.log('Users in project:', users.length)

// Map old worker emails → new accounts still get profiles
for (const s of staff) {
  const id = await upsertUser(s, users)
  await upsertProfile(id, s)
}

// Also retarget old workers if they still exist (optional map to barista)
const legacy = [
  {
    email: 'worker1@pristinamuffins.local',
    role: 'barista',
    name: 'Shankist (vjetër 1)',
  },
  {
    email: 'worker2@pristinamuffins.local',
    role: 'barista',
    name: 'Shankist (vjetër 2)',
  },
  {
    email: 'worker3@pristinamuffins.local',
    role: 'waitress',
    name: 'Kamerier (vjetër 3)',
  },
  {
    email: 'worker4@pristinamuffins.local',
    role: 'waitress',
    name: 'Kamerier (vjetër 4)',
  },
]
for (const l of legacy) {
  const u = users.find((x) => (x.email || '').toLowerCase() === l.email)
  if (!u) continue
  await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      app_metadata: { ...(u.app_metadata || {}), role: l.role },
      user_metadata: {
        ...(u.user_metadata || {}),
        display_name: l.name,
      },
    }),
  })
  await upsertProfile(u.id, {
    username: l.email.split('@')[0],
    email: l.email,
    name: l.name,
    role: l.role,
  })
  console.log('LEGACY MAP', l.email, '→', l.role)
}

console.log('\n=== Logins (username + password) ===')
for (const s of staff) {
  if (s.password) console.log(`${s.username}  /  ${s.password}  (${s.role})`)
  else console.log(`${s.username}  /  (your admin password)`)
}
