import { describe, it, expect } from 'vitest'
import { isSessionHeld, summarizeAttendance, istNow } from '@/lib/attendance'
import { makeCourse } from './helpers'

describe('isSessionHeld — date AND time aware', () => {
  const TODAY = '2026-06-11'
  const NOW = '12:00'
  it('counts a past date as held', () => {
    expect(isSessionHeld('2026-06-10', '09:15', TODAY, NOW)).toBe(true)
  })
  it('counts a future date as not held', () => {
    expect(isSessionHeld('2026-06-12', '09:15', TODAY, NOW)).toBe(false)
  })
  it('today BEFORE the start time is not held (the bug we fixed)', () => {
    expect(isSessionHeld('2026-06-11', '14:30', TODAY, NOW)).toBe(false)
  })
  it('today AT or AFTER the start time is held', () => {
    expect(isSessionHeld('2026-06-11', '12:00', TODAY, NOW)).toBe(true)
    expect(isSessionHeld('2026-06-11', '09:15', TODAY, NOW)).toBe(true)
  })
  it('treats a missing date as not held', () => {
    expect(isSessionHeld(null, '09:15', TODAY, NOW)).toBe(false)
  })
})

describe('summarizeAttendance', () => {
  const TODAY = '2026-06-11'
  const NOW = '23:59'

  it('rolls up held/left, present/absent and credits×8 expectation per course', () => {
    const sessions = [
      makeCourse({ id: 's1', course_code: 'GT-A', credits: '3', session_date: '2026-06-09', start_time: '09:15' }),
      makeCourse({ id: 's2', course_code: 'GT-A', credits: '3', session_date: '2026-06-10', start_time: '09:15' }),
      makeCourse({ id: 's3', course_code: 'GT-A', credits: '3', session_date: '2026-06-20', start_time: '09:15' }),
    ]
    const att = new Map([['s1', 'present'], ['s2', 'absent']])
    const [stat] = summarizeAttendance(sessions, att, TODAY, NOW)
    expect(stat.code).toBe('GT-A')
    expect(stat.total).toBe(3)
    expect(stat.held).toBe(2)        // s1, s2 in the past
    expect(stat.left).toBe(1)        // s3 future
    expect(stat.present).toBe(1)
    expect(stat.absent).toBe(1)
    expect(stat.expected).toBe(24)   // 3 credits × 8
  })

  it('excludes cancelled sessions from totals but keeps the course', () => {
    const sessions = [
      makeCourse({ id: 'a', course_code: 'CB', session_date: '2026-06-09', start_time: '09:15' }),
      makeCourse({ id: 'b', course_code: 'CB', session_date: '2026-06-10', start_time: '09:15', is_cancelled: true }),
    ]
    const [stat] = summarizeAttendance(sessions, new Map(), TODAY, NOW)
    expect(stat.total).toBe(1)
    expect(stat.held).toBe(1)
  })

  it('excludes common events (exams) entirely', () => {
    const sessions = [
      makeCourse({ id: 'x', course_code: 'EXAM', is_common: true, session_date: '2026-06-09' }),
    ]
    expect(summarizeAttendance(sessions, new Map(), TODAY, NOW)).toHaveLength(0)
  })
})

describe('istNow', () => {
  it('returns IST date and HH:MM for a known instant', () => {
    // 2026-06-11 19:00 UTC = 2026-06-12 00:30 IST
    expect(istNow(Date.parse('2026-06-11T19:00:00Z'))).toEqual({ todayISO: '2026-06-12', nowHM: '00:30' })
  })
})
