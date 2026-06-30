import { describe, it, expect } from 'vitest'
import { resolveViewYear, coursesForYear, adminCollapseSessions } from '@/lib/year-view'

describe('resolveViewYear', () => {
  it('pins a student to their own year, ignoring the admin tab', () => {
    expect(resolveViewYear(false, 1, 2)).toBe(1)
    expect(resolveViewYear(false, 2, 1)).toBe(2)
  })
  it('defaults a student with no/unknown year to 2nd year', () => {
    expect(resolveViewYear(false, null, 1)).toBe(2)
    expect(resolveViewYear(false, undefined, 1)).toBe(2)
    expect(resolveViewYear(false, 0, 1)).toBe(2)
  })
  it('follows the admin tab regardless of the admin’s own year', () => {
    expect(resolveViewYear(true, 2, 1)).toBe(1)
    expect(resolveViewYear(true, 1, 2)).toBe(2)
    expect(resolveViewYear(true, null, 1)).toBe(1)
  })
})

describe('coursesForYear', () => {
  const rows = [
    { id: 'a', year: 1 },
    { id: 'b', year: 2 },
    { id: 'c', year: null },      // null ⇒ treated as 2
    { id: 'd' },                  // missing ⇒ treated as 2
  ]
  it('keeps only the rows for the requested year', () => {
    expect(coursesForYear(rows, 1).map((r) => r.id)).toEqual(['a'])
  })
  it('treats null/missing year as 2nd year', () => {
    expect(coursesForYear(rows, 2).map((r) => r.id)).toEqual(['b', 'c', 'd'])
  })
  it('returns empty for a year with no rows', () => {
    expect(coursesForYear([{ id: 'x', year: 2 }], 1)).toEqual([])
  })
})

describe('adminCollapseSessions', () => {
  // The same 1st-year class taught to two sections at one time, each in a different room.
  const eco = (id: string, room: string) => ({
    id, course_code: 'ECO', session_date: '2026-06-09', start_time: '09:15', room, year: 1, is_common: false,
  })
  const rows = [
    eco('a', 'CR A1'),
    eco('b', 'CR B2'),
    { id: 'gt', course_code: 'GT-A', session_date: '2026-06-09', start_time: '11:00', room: 'D1', year: 2, is_common: false },
    { id: 'exam', course_code: 'EXAM', session_date: '2026-06-09', start_time: '14:00', room: 'Hall', year: 1, is_common: true },
  ]

  it('returns the list untouched for a non-admin', () => {
    expect(adminCollapseSessions(rows, false)).toBe(rows)
  })

  it('collapses all-sections 1st-year duplicates to one room-less entry per class', () => {
    const out = adminCollapseSessions(rows, true)
    const ecoRows = out.filter((r) => r.course_code === 'ECO')
    expect(ecoRows).toHaveLength(1)         // the two sections folded into one
    expect(ecoRows[0].room).toBeNull()      // no single classroom for "in all sections"
  })

  it('leaves 2nd-year electives and common events (with their rooms) intact', () => {
    const out = adminCollapseSessions(rows, true)
    const gt = out.find((r) => r.course_code === 'GT-A')!
    const exam = out.find((r) => r.course_code === 'EXAM')!
    expect(gt.room).toBe('D1')              // a 2nd-year elective keeps its venue
    expect(exam.room).toBe('Hall')          // a common event is untouched
  })

  it('keeps DIFFERENT 1st-year times/classes as separate entries', () => {
    const out = adminCollapseSessions(
      [eco('a', 'CR A1'), { ...eco('c', 'CR A1'), start_time: '11:00' }],
      true
    )
    expect(out).toHaveLength(2)             // same class, different time ⇒ both kept
  })
})
