export function formatEuro(amount: number): string {
  return `€${amount.toFixed(2)}`
}

/** Whole minutes since `iso` (0 if in the future). */
export function waitMinutes(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))
}

/** Wait-time priority for live board (longer wait = higher priority). */
export type WaitPriority = 'normal' | 'warm' | 'hot' | 'critical'

export function waitPriority(minutes: number): WaitPriority {
  if (minutes >= 15) return 'critical'
  if (minutes >= 10) return 'hot'
  if (minutes >= 5) return 'warm'
  return 'normal'
}

/** Albanian relative time for staff board. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.floor((now - new Date(iso).getTime()) / 1000)

  if (seconds < 15) return 'tani'
  if (seconds < 60) return `${seconds}s më parë`

  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return '1 min më parë'
  if (minutes < 60) return `${minutes} min më parë`

  const hours = Math.floor(minutes / 60)
  if (hours === 1) return '1 orë më parë'
  if (hours < 24) return `${hours} orë më parë`

  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
