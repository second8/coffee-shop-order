import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './orders'
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

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ error: string | null }> {
  if (!supabase) {
    // Demo: admin@demo.local / admin → admin, worker@demo.local / worker → worker
    const e = email.trim().toLowerCase()
    let role: StaffRole | null = null
    if (e === 'admin@demo.local' && password === 'admin') role = 'admin'
    if (e === 'worker@demo.local' && password === 'worker') role = 'worker'
    if (!role) {
      return { error: 'Email ose fjalëkalim i gabuar (demo: admin@demo.local / admin)' }
    }
    const profile: StaffProfile = {
      id: role === 'admin' ? 'demo-admin' : 'demo-worker',
      email: e,
      role,
      display_name: role === 'admin' ? 'Admin' : 'Punëtor',
    }
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(profile))
    return { error: null }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) return { error: error.message }
  return { error: null }
}

export async function signOut(): Promise<void> {
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
  userId: string,
  email: string
): Promise<StaffProfile | null> {
  if (!supabase) return getDemoProfile()

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, role, display_name')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    // Fallback: treat any logged-in user without profile as worker
    return {
      id: userId,
      email,
      role: 'worker',
      display_name: email.split('@')[0] ?? null,
    }
  }

  return {
    id: data.id as string,
    email,
    role: data.role as StaffRole,
    display_name: (data.display_name as string | null) ?? null,
  }
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
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
