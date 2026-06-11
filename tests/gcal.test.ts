import { describe, it, expect } from 'vitest'
import { planCalendarSync } from '@/lib/gcal'
import { makeCourse } from './helpers'

// course_id → gcal_event_id
function map(pairs: [string, string][]) {
  return new Map(pairs)
}

describe('planCalendarSync', () => {
  const sessions = [
    makeCourse({ id: 's1', course_code: 'GT-A' }),
    makeCourse({ id: 's2', course_code: 'GT-A' }),
    makeCourse({ id: 's3', course_code: 'CB' }),
    makeCourse({ id: 'x1', course_code: 'MID_TERM', is_common: true }),
  ]

  it('full sync (no changedCodes) processes every current session', () => {
    const plan = planCalendarSync(sessions, map([]))
    expect(plan.toUpsert.map((c) => c.id).sort()).toEqual(['s1', 's2', 's3', 'x1'])
    expect(plan.toDelete).toHaveLength(0)
  })

  it('incremental sync only touches sessions of the changed courses', () => {
    const plan = planCalendarSync(sessions, map([]), new Set(['GT-A']))
    expect(plan.toUpsert.map((c) => c.id).sort()).toEqual(['s1', 's2'])
    expect(plan.toDelete).toHaveLength(0)
  })

  it('a user unaffected by the change gets an empty plan → zero API calls', () => {
    const plan = planCalendarSync(sessions, map([['s1', 'e1']]), new Set(['SOMETHING_ELSE']))
    expect(plan.toUpsert).toHaveLength(0)
    expect(plan.toDelete).toHaveLength(0)
  })

  it('deletes orphaned events whose course is no longer current (removed/unpicked)', () => {
    // 'gone' is mapped but not among current sessions → must be deleted.
    const existing = map([['s1', 'e1'], ['gone', 'e-gone']])
    const plan = planCalendarSync(sessions, existing, new Set(['GT-A']))
    expect(plan.toUpsert.map((c) => c.id).sort()).toEqual(['s1', 's2'])
    expect(plan.toDelete).toEqual([{ courseId: 'gone', eventId: 'e-gone' }])
  })

  it('orphan cleanup runs even when no course in the change set is enrolled', () => {
    const existing = map([['gone', 'e-gone']])
    const plan = planCalendarSync(sessions, existing, new Set(['UNRELATED']))
    expect(plan.toUpsert).toHaveLength(0)
    expect(plan.toDelete).toEqual([{ courseId: 'gone', eventId: 'e-gone' }])
  })

  it('inserts (no mapping yet) are included for changed courses', () => {
    // s3/CB has no map entry; a CB change should still upsert it (insert path).
    const plan = planCalendarSync(sessions, map([['s1', 'e1']]), new Set(['CB']))
    expect(plan.toUpsert.map((c) => c.id)).toEqual(['s3'])
  })
})
