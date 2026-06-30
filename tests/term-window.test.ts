import { describe, it, expect } from 'vitest'
import { termDates } from '@/lib/term-window'

describe('termDates — the Today rail follows the uploaded schedule', () => {
  it('spans from a few days before the first session to a few days after the last', () => {
    const out = termDates(['2026-07-10', '2026-07-01', '2026-07-20'], '2026-07-05', 3)
    expect(out[0]).toBe('2026-06-28')               // 2026-07-01 − 3 days
    expect(out[out.length - 1]).toBe('2026-07-23')  // 2026-07-20 + 3 days
    expect(out).toContain('2026-07-05')             // today is inside the span
  })

  it('1st-year and 2nd-year windows differ because their sessions differ', () => {
    const y1 = termDates(['2026-06-01', '2026-06-30'], '2026-06-15', 0)
    const y2 = termDates(['2026-07-01', '2026-08-31'], '2026-07-15', 0)
    expect([y1[0], y1[y1.length - 1]]).toEqual(['2026-06-01', '2026-06-30'])
    expect([y2[0], y2[y2.length - 1]]).toEqual(['2026-07-01', '2026-08-31'])
  })

  it('falls back to a window centred on today when there are no sessions', () => {
    const out = termDates([], '2026-06-15', 3, 7)
    expect(out[0]).toBe('2026-06-08')                // today − 7
    expect(out[out.length - 1]).toBe('2026-06-22')   // today + 7
    expect(out).toContain('2026-06-15')
  })

  it('ignores null / malformed dates', () => {
    expect(termDates(['2026-07-10', null, undefined, 'nope', ''], '2026-07-10', 0)).toEqual(['2026-07-10'])
  })

  it('produces a contiguous, sorted, de-duped date list', () => {
    expect(termDates(['2026-07-03', '2026-07-01'], '2026-07-02', 0)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
  })
})
