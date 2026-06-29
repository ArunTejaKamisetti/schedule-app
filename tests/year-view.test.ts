import { describe, it, expect } from 'vitest'
import { resolveViewYear, coursesForYear } from '@/lib/year-view'

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
