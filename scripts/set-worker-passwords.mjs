/**
 * Reset worker passwords. Requires env SUPABASE_SERVICE_ROLE_KEY.
 * Usage: set SUPABASE_SERVICE_ROLE_KEY=... && node scripts/set-worker-passwords.mjs
 */
const url =
  process.env.VITE_SUPABASE_URL || 'https://xdqigvsgmutjimzddwqi.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!key) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY first')
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

const workers = [
  {
    email: 'worker1@pristinamuffins.local',
    password: 'Kafi-Blue7!mX',
    name: 'Punëtor 1',
  },
  {
    email: 'worker2@pristinamuffins.local',
    password: 'Lule#River92q',
    name: 'Punëtor 2',
  },
  {
    email: 'worker3@pristinamuffins.local',
    password: 'MangoNight4w!',
    name: 'Punëtor 3',
  },
  {
    email: 'worker4@pristinamuffins.local',
    password: 'Zjarr-Oak81pT',
    name: 'Punëtor 4',
  },
]

const list = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=100`, {
  headers,
})
const body = await list.json()
const users = body.users || []

for (const w of workers) {
  const u = users.find((x) => x.email === w.email)
  if (!u) {
    console.log('NOT_FOUND', w.email)
    continue
  }
  const res = await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password: w.password }),
  })
  console.log(res.status, w.name, res.ok ? 'OK' : await res.text())
}

for (const w of workers) {
  console.log(`${w.name}: ${w.email} / ${w.password}`)
}
