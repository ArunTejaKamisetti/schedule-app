import type { CourseChange } from './types'

// Pure notification formatting + dedup-key logic. Kept free of DB/Next imports so it can be
// unit-tested in isolation and reused by lib/notify.ts.

const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// "2026-06-12" → "Fri 12 Jun". Built from UTC parts to avoid timezone drift.
export function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const wd = WD3[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${wd} ${d} ${MONTHS3[m - 1]}`
}

export function buildTitle(ch: CourseChange): string {
  switch (ch.type) {
    case 'cancelled': return `${ch.course_name} — Cancelled`
    case 'rescheduled': return `${ch.course_name} — Rescheduled`
    case 'room_change': return `${ch.course_name} — Room Changed`
    case 'added': return `New: ${ch.course_name}`
    case 'removed': return `Removed: ${ch.course_name}`
    case 'schedule_update': return `${ch.course_name} — Schedule Updated`
  }
}

export function buildBody(ch: CourseChange): string {
  const when = fmtDate(ch.new?.session_date ?? ch.old?.session_date)
  switch (ch.type) {
    case 'cancelled':
      return `${when}, ${ch.old?.start_time ?? ''} — class cancelled.`
    case 'rescheduled':
      return ch.note ? `${when}: ${ch.note}` : `${when} rescheduled to ${ch.new?.start_time}`
    case 'room_change':
      return ch.note ? `${when}: ${ch.note}` : `${when}: class changed ${ch.old?.room ?? '?'} → ${ch.new?.room ?? '?'}`
    case 'added':
      return `${when}, ${ch.new?.start_time}–${ch.new?.end_time}${ch.new?.room ? ` · Class ${ch.new.room}` : ''}`
    case 'removed':
      return `${when}, ${ch.old?.start_time} — session removed.`
    case 'schedule_update':
      return ch.note ? `${when}: ${ch.note}` : `${when}: session updated.`
  }
}

// One IST calendar day for the given instant (defaults to now). Buckets the dedup key so the
// SAME change processed by several concurrent/rapid syncs collapses to one alert.
export function istDay(now: number = Date.now()): string {
  const d = new Date(now + 5.5 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Stable identity of one logical change, for one user, on one day.
export function dedupKey(ch: CourseChange, day: string = istDay()): string {
  const date = ch.new?.session_date ?? ch.old?.session_date ?? ''
  const time = ch.new?.start_time ?? ch.old?.start_time ?? ''
  return `${day}::${ch.type}::${ch.course_code}::${date}::${time}`
}
