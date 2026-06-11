import { describe, it, expect } from 'vitest'
import { selectUpcoming, toMinutes, reminderText, reminderDedupKey } from '@/lib/reminders'
import { makeCourse } from './helpers'

describe('toMinutes', () => {
  it('converts HH:MM to minutes; nullish → -1', () => {
    expect(toMinutes('09:15')).toBe(555)
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes(null)).toBe(-1)
  })
})

describe('selectUpcoming — classes starting within the lead window', () => {
  const at = (id: string, t: string, over = {}) => makeCourse({ id, start_time: t, ...over })
  const now = toMinutes('09:00') // 540

  it('includes a class starting within the next 14 min', () => {
    const got = selectUpcoming([at('a', '09:14')], now, 14)
    expect(got.map((c) => c.id)).toEqual(['a'])
  })

  it('excludes a class just outside the window (15 min away)', () => {
    expect(selectUpcoming([at('a', '09:15')], now, 14)).toHaveLength(0)
  })

  it('excludes a class that already started', () => {
    expect(selectUpcoming([at('a', '08:59')], now, 14)).toHaveLength(0)
    expect(selectUpcoming([at('a', '09:00')], now, 14)).toHaveLength(0) // exactly now = started
  })

  it('excludes cancelled classes', () => {
    expect(selectUpcoming([at('a', '09:10', { is_cancelled: true })], now, 14)).toHaveLength(0)
  })

  it('picks only the in-window classes out of a mixed set', () => {
    const set = [at('past', '08:50'), at('soon', '09:10'), at('edge', '09:14'), at('later', '10:00')]
    expect(selectUpcoming(set, now, 14).map((c) => c.id).sort()).toEqual(['edge', 'soon'])
  })
})

describe('reminderText / reminderDedupKey', () => {
  it('formats a friendly heads-up with minutes, time and room', () => {
    const c = makeCourse({ course_code: 'GT-A', course_name: 'Game Theory', start_time: '09:15', room: 'D1' })
    expect(reminderText(c, 14)).toEqual({ title: '⏰ GT-A in 14 min', body: 'Game Theory · 09:15 · Class D1' })
  })

  it('dedup key pins one reminder per class occurrence', () => {
    const c = makeCourse({ course_code: 'GT-A', session_date: '2026-06-12', start_time: '09:15' })
    expect(reminderDedupKey(c)).toBe('class-reminder::2026-06-12::09:15::GT-A')
  })
})
