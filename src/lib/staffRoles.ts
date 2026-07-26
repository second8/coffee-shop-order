import type { StaffRole } from '../types'

/** Supabase Auth still uses email; UI uses short usernames. */
export const STAFF_EMAIL_DOMAIN = 'pristinamuffins.local'

export function usernameToEmail(username: string): string {
  const u = username.trim().toLowerCase()
  if (!u) return u
  if (u.includes('@')) return u
  return `${u}@${STAFF_EMAIL_DOMAIN}`
}

export function emailToUsername(email: string): string {
  const e = email.trim().toLowerCase()
  if (e.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) {
    return e.slice(0, -(STAFF_EMAIL_DOMAIN.length + 1))
  }
  return e.split('@')[0] || e
}

export function normalizeRole(raw: string | null | undefined): StaffRole {
  if (raw === 'admin') return 'admin'
  if (raw === 'waitress' || raw === 'kamerieri') return 'waitress'
  if (raw === 'barista' || raw === 'shankisti') return 'barista'
  if (raw === 'worker') return 'worker'
  return 'worker'
}

/** Kitchen monitor role (shankisti). Legacy worker counts as barista. */
export function isKitchenRole(role: StaffRole): boolean {
  return role === 'barista' || role === 'worker'
}

/** Floor / bills monitor (kamerieri). */
export function isWaitressRole(role: StaffRole): boolean {
  return role === 'waitress'
}

export function isAdminRole(role: StaffRole): boolean {
  return role === 'admin'
}

export function roleLabelSq(role: StaffRole): string {
  if (role === 'admin') return 'Admin'
  if (role === 'waitress') return 'Kamerier'
  if (role === 'barista') return 'Shankist'
  return 'Punëtor'
}
