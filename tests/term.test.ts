import { describe, it, expect } from 'vitest'
import { TERM_START, TERM_END, TERM_DATES, localISO } from '@/lib/term'

// The Home page builds its day-selector rail from TERM_DATES. When the sheet rolls over to a new
// term and this window doesn't, Home is stranded in the previous term while the schedule page —
// which derives its week from today's date — has already moved on. That is exactly the bug these
// tests exist to catch, so they pin the window to the term the sheet actually carries.
describe('term window', () => {
  it('covers Term V: registration weekend through the last end-term day', () => {
    expect(TERM_START).toBe('2026-09-04')
    expect(TERM_END).toBe('2026-12-03')
  })

  it('spans the dates the Term V sheet actually carries', () => {
    // First teaching day and last examination day, as parsed from the live sheet.
    expect(TERM_DATES).toContain('2026-09-07')
    expect(TERM_DATES).toContain('2026-12-03')
    // Term IV is over — none of its dates may still be selectable.
    expect(TERM_DATES).not.toContain('2026-08-31')
    expect(TERM_DATES).not.toContain('2026-06-08')
  })

  it('is a contiguous, ordered, duplicate-free run of days', () => {
    expect(TERM_DATES[0]).toBe(TERM_START)
    expect(TERM_DATES[TERM_DATES.length - 1]).toBe(TERM_END)
    expect(new Set(TERM_DATES).size).toBe(TERM_DATES.length)
    for (let i = 1; i < TERM_DATES.length; i++) {
      expect(TERM_DATES[i] > TERM_DATES[i - 1], `${TERM_DATES[i - 1]} → ${TERM_DATES[i]}`).toBe(true)
      const prev = new Date(TERM_DATES[i - 1] + 'T00:00:00')
      prev.setDate(prev.getDate() + 1)
      expect(localISO(prev), `gap after ${TERM_DATES[i - 1]}`).toBe(TERM_DATES[i])
    }
  })

  it('has a start before its end, and a plausible term length', () => {
    expect(TERM_START < TERM_END).toBe(true)
    // A term is roughly a quarter — enough to catch a typo'd year or a reversed range.
    expect(TERM_DATES.length).toBeGreaterThan(60)
    expect(TERM_DATES.length).toBeLessThan(140)
  })

  it('localISO reads the LOCAL date, not the UTC one', () => {
    // 23:30 local on 7 Sep is already 8 Sep in UTC for IST — toISOString() would report the wrong
    // day for every evening class.
    expect(localISO(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07')
    expect(localISO(new Date(2026, 8, 7, 0, 30))).toBe('2026-09-07')
    expect(localISO(new Date(2026, 11, 3))).toBe('2026-12-03')
  })
})
