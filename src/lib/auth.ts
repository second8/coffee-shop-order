import type { Session, User } from '@supabase/supabase-js'
import {
  endStaffSession,
  isSupabaseConfigured,
  startStaffSession,
  supabase,
} from './orders'
import {
  emailToUsername,
  normalizeRole,
  usernameToEmail,
} from './staffRoles'
import type { StaffProfile, StaffRole } from '../types'

export type AuthState = {
  session: Session | null
  user: User | null
  profile: StaffProfile | null
  loading: boolean
}

/** Local demo staff when Supabase is off (development only). */
const DEMO_SESSION_KEY = 'cafe-sol-demo-staff'

export function isDemoAuth(): boolean {
  return !isSupabaseConfigured
}

function roleFromUser(user: User): StaffRole | null {
  const raw =
    (user.app_metadata?.role as string | undefined) ||
    (user.user_metadata?.role as string | undefined)
  if (!raw) return null
  return normalizeRole(raw)
}

/**
 * Login with username (shankisti1) or full email.
 * Usernames map to username@pristinamuffins.local
 */
export async function signInWithUsername(
  usernameOrEmail: string,
  password: string
): Promise<{ error: string | null }> {
  const email = usernameToEmail(usernameOrEmail)
  return signInWithEmail(email, password)
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ error: string | null }> {
  if (!supabase) {
    const e = email.trim().toLowerCase()
    const user = e.includes('@') ? e.split('@')[0]! : e
    const demos: Record<
      string,
      { role: StaffRole; name: string; password: string }
    > = {
      admin: { role: 'admin', name: 'Admin', password: 'admin' },
      shankisti1: { role: 'barista', name: 'Shankist 1', password: 'kafe11' },
      shankisti2: { role: 'barista', name: 'Shankist 2', password: 'kafe22' },
      kamerieri1: {
        role: 'waitress',
        name: 'Kamerier 1',
        password: 'fature11',
      },
      kamerieri2: {
        role: 'waitress',
        name: 'Kamerier 2',
        password: 'fature22',
      },
      worker: { role: 'barista', name: 'Punëtor', password: 'worker' },
    }
    const demo = demos[user]
    if (!demo || demo.password !== password) {
      return {
        error:
          'Përdorues ose fjalëkalim i gabuar (demo: shankisti1 / kafe11)',
      }
    }
    const profile: StaffProfile = {
      id: `demo-${user}`,
      email: usernameToEmail(user),
      role: demo.role,
      display_name: demo.name,
      username: user,
    }
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(profile))
    await startStaffSession(profile.id, profile.display_name)
    return { error: null }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) return { error: error.message }

  if (data.user) {
    const profile = await fetchStaffProfile(data.user)
    if (profile) {
      await startStaffSession(profile.id, profile.display_name)
    }
  }
  return { error: null }
}

/**
 * Re-verify admin password (for dangerous actions like wipe).
 */
export async function verifyAdminPassword(
  password: string
): Promise<{ ok: boolean; error: string | null }> {
  if (!supabase) {
    return { ok: password === 'admin', error: null }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const email = session?.user?.email
  if (!email) return { ok: false, error: 'Nuk jeni i kyçur' }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) return { ok: false, error: 'Fjalëkalim i gabuar' }
  return { ok: true, error: null }
}

export async function signOut(): Promise<void> {
  await endStaffSession()
  if (!supabase) {
    sessionStorage.removeItem(DEMO_SESSION_KEY)
    return
  }
  await supabase.auth.signOut()
}

export function getDemoProfile(): StaffProfile | null {
  try {
    const raw = sessionStorage.getItem(DEMO_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StaffProfile
  } catch {
    return null
  }
}

export async function fetchStaffProfile(
  user: User
): Promise<StaffProfile | null> {
  if (!supabase) return getDemoProfile()

  const email = user.email ?? ''
  const metaRole = roleFromUser(user)
  const metaName =
    (user.user_metadata?.display_name as string | undefined) ?? null

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, role, display_name')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('staff_profiles read error:', error.message)
  }

  if (data?.role) {
    const role = normalizeRole(data.role as string)
    return {
      id: data.id as string,
      email,
      role,
      display_name:
        (data.display_name as string | null) ||
        metaName ||
        emailToUsername(email),
      username: emailToUsername(email),
    }
  }

  if (metaRole) {
    return {
      id: user.id,
      email,
      role: metaRole,
      display_name: metaName ?? emailToUsername(email),
      username: emailToUsername(email),
    }
  }

  return {
    id: user.id,
    email,
    role: 'worker',
    display_name: metaName ?? emailToUsername(email),
    username: emailToUsername(email),
  }
}

export async function ensureStaffSession(
  profile: StaffProfile
): Promise<void> {
  const existing =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('cafe-sol-session-id')
      : null
  if (existing) return
  await startStaffSession(profile.id, profile.display_name)
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function refreshSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.refreshSession()
  if (error) {
    console.error('refreshSession', error.message)
    return getSession()
  }
  return data.session
}

export function onAuthChange(
  cb: (session: Session | null) => void
): () => void {
  if (!supabase) {
    return () => undefined
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session)
  })
  return () => data.subscription.unsubscribe()
}
