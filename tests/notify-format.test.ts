import { describe, it, expect } from 'vitest'
import { buildTitle, buildBody, dedupKey, fmtDate, istDay } from '@/lib/notify-format'
import type { CourseChange } from '@/lib/types'

const base = (over: Partial<CourseChange>): CourseChange => ({
  type: 'added', course_code: 'GT-A', course_name: 'Game Theory', ...over,
})

describe('fmtDate', () => {
  it('formats ISO dates as "Wd D Mon" from UTC parts', () => {
    expect(fmtDate('2026-06-12')).toBe('Fri 12 Jun')
    expect(fmtDate('2026-01-01')).toBe('Thu 1 Jan')
  })
  it('returns empty for nullish and echoes unparseable input', () => {
    expect(fmtDate(null)).toBe('')
    expect(fmtDate('')).toBe('')
  })
})

describe('buildTitle', () => {
  it('renders a distinct title per change type', () => {
    expect(buildTitle(base({ type: 'cancelled' }))).toBe('Game Theory — Cancelled')
    expect(buildTitle(base({ type: 'rescheduled' }))).toBe('Game Theory — Rescheduled')
    expect(buildTitle(base({ type: 'room_change' }))).toBe('Game Theory — Room Changed')
    expect(buildTitle(base({ type: 'added' }))).toBe('New: Game Theory')
    expect(buildTitle(base({ type: 'removed' }))).toBe('Removed: Game Theory')
    expect(buildTitle(base({ type: 'schedule_update' }))).toBe('Game Theory — Schedule Updated')
  })
})

describe('buildBody', () => {
  it('added shows date, time range and room', () => {
    const body = buildBody(base({ type: 'added', new: { session_date: '2026-06-12', start_time: '09:15', end_time: '10:30', room: 'D1' } }))
    expect(body).toBe('Fri 12 Jun, 09:15–10:30 · Class D1')
  })
  it('cancelled shows the old time', () => {
    const body = buildBody(base({ type: 'cancelled', old: { session_date: '2026-06-12', start_time: '14:30' } }))
    expect(body).toBe('Fri 12 Jun, 14:30 — class cancelled.')
  })
  it('rescheduled prefers an explicit note', () => {
    const body = buildBody(base({ type: 'rescheduled', new: { session_date: '2026-06-12', start_time: '16:00' }, note: 'Moved from 12:15 D1 → 16:00 D1' }))
    expect(body).toBe('Fri 12 Jun: Moved from 12:15 D1 → 16:00 D1')
  })
})

describe('dedupKey — notification idempotency identity', () => {
  const DAY = '2026-06-11'
  it('is identical for the same logical change (so duplicates collapse)', () => {
    const ch = base({ type: 'cancelled', old: { session_date: '2026-06-12', start_time: '14:30' } })
    expect(dedupKey(ch, DAY)).toBe(dedupKey(ch, DAY))
    expect(dedupKey(ch, DAY)).toBe('2026-06-11::cancelled::GT-A::2026-06-12::14:30')
  })
  it('differs by type, time and course (so distinct changes are kept)', () => {
    const at = (over: Partial<CourseChange>) => dedupKey(base(over), DAY)
    const cancel1430 = at({ type: 'cancelled', old: { session_date: '2026-06-12', start_time: '14:30' } })
    const add0915 = at({ type: 'added', new: { session_date: '2026-06-12', start_time: '09:15' } })
    const cancel1230 = at({ type: 'cancelled', old: { session_date: '2026-06-12', start_time: '12:30' } })
    const otherCourse = at({ type: 'cancelled', course_code: 'CB', old: { session_date: '2026-06-12', start_time: '14:30' } })
    expect(new Set([cancel1430, add0915, cancel1230, otherCourse]).size).toBe(4)
  })
  it('buckets by IST day so a genuine repeat on another day re-alerts', () => {
    const ch = base({ type: 'cancelled', old: { session_date: '2026-06-12', start_time: '14:30' } })
    expect(dedupKey(ch, '2026-06-11')).not.toBe(dedupKey(ch, '2026-06-12'))
  })
})

describe('istDay — UTC+5:30 bucketing', () => {
  it('rolls into the next day for late-UTC instants', () => {
    // 2026-06-11 19:00 UTC = 2026-06-12 00:30 IST
    expect(istDay(Date.parse('2026-06-11T19:00:00Z'))).toBe('2026-06-12')
    // 2026-06-11 10:00 UTC = 2026-06-11 15:30 IST
    expect(istDay(Date.parse('2026-06-11T10:00:00Z'))).toBe('2026-06-11')
  })
})
