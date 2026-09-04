import { describe, it, expect } from 'vitest'
import {
  EXAM_SCHEDULE, SLOT_ORDER, EXAM_SOURCE_KEY,
  examEvents, examEventsBetween, hasExamsOn, isEndTermExam, isMyExam, withEndTermExams,
} from '@/lib/exams'
import type { Course } from '@/lib/types'

const SLOTS = ['Morning', 'Afternoon', 'Evening']

// A sheet-derived row, for the "not an end-term paper" cases.
const dbRow = (over: Partial<Course> = {}): Course => ({
  id: 'db-1', course_code: 'CSL', course_name: 'Corporate Strategic Leadership', instructor: null,
  day_of_week: 'MON', session_date: '2026-09-07', start_time: '09:15', end_time: '10:30',
  room: 'D1', credits: '3', area: 'SM', sheet_tab: 'PGP-29 D1', sheet_row_index: 6,
  year: 2, source_key: 'y2', is_cancelled: false, is_common: false, event_kind: 'class',
  change_kind: null, change_note: null, last_changed_at: null, last_synced_at: '', ...over,
})

// EXAM_SCHEDULE is EMPTY between terms: Term IV's papers were removed when the term closed and
// the Programmes Office has not published Term V's list yet. These tests therefore assert the
// module's INVARIANTS rather than a fixed paper list, so they keep their teeth the moment the
// Term V papers are transcribed into lib/exams.ts.
describe('EXAM_SCHEDULE data', () => {
  it('is empty between terms — the app falls back to the sheet\'s own exam banner', () => {
    expect(EXAM_SCHEDULE).toEqual([])
    expect(examEvents()).toEqual([])
  })

  it('gives every paper a known slot, a title and at least one course code', () => {
    for (const e of EXAM_SCHEDULE) {
      expect(SLOTS, e.title).toContain(e.slot)
      expect(e.title.trim().length, e.title).toBeGreaterThan(0)
      expect(e.codes.length, e.title).toBeGreaterThan(0)
      for (const c of e.codes) expect(c.trim().length, `${e.title} → "${c}"`).toBeGreaterThan(0)
    }
  })

  it('uses ISO dates', () => {
    for (const e of EXAM_SCHEDULE) expect(e.date, e.title).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('never lists the same course code under two papers', () => {
    const seen = new Map<string, string>()
    for (const e of EXAM_SCHEDULE) {
      for (const c of e.codes) {
        expect(seen.get(c), `${c}: "${seen.get(c)}" vs "${e.title}"`).toBeUndefined()
        seen.set(c, e.title)
      }
    }
  })

  it('keeps each title unique within its date + slot (they render side by side)', () => {
    const keys = EXAM_SCHEDULE.map((e) => `${e.date}|${e.slot}|${e.title}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('examEvents()', () => {
  const events = examEvents()

  it('emits one common exam row per paper, tagged to the 2nd year', () => {
    expect(events.length).toBe(EXAM_SCHEDULE.length)
    for (const c of events) {
      expect(c.is_common).toBe(true)
      expect(c.event_kind).toBe('exam')
      expect(c.year).toBe(2)
      expect(c.is_cancelled).toBe(false)
      expect(c.source_key).toBe(EXAM_SOURCE_KEY)
    }
  })

  it('shows the slot instead of a clock time (the PDF publishes no times)', () => {
    for (const [i, c] of events.entries()) {
      expect(c.time_label).toBe(EXAM_SCHEDULE[i].slot)
      expect(c.end_time).toBeNull()
      // start_time exists only to order/place the row.
      expect(c.start_time).toBe(SLOT_ORDER[EXAM_SCHEDULE[i].slot])
    }
  })

  it('orders morning → afternoon → evening within a day', () => {
    expect(SLOT_ORDER.Morning < SLOT_ORDER.Afternoon).toBe(true)
    expect(SLOT_ORDER.Afternoon < SLOT_ORDER.Evening).toBe(true)
  })

  it('gives every row a unique id (React keys / Today\'s de-dup by id)', () => {
    expect(new Set(events.map((c) => c.id)).size).toBe(events.length)
  })

  it('derives the weekday from the date', () => {
    const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    for (const c of events) {
      expect(c.day_of_week, c.session_date!).toBe(WEEKDAYS[new Date(`${c.session_date}T00:00:00Z`).getUTCDay()])
    }
  })

  it('returns the same objects each call (stable identity for SWR-derived arrays)', () => {
    expect(examEvents()).toBe(events)
  })
})

describe('examEventsBetween()', () => {
  it('returns exactly the papers inside an inclusive window', () => {
    const dates = [...new Set(EXAM_SCHEDULE.map((e) => e.date))].sort()
    if (dates.length === 0) {
      expect(examEventsBetween('2026-09-01', '2026-12-31')).toEqual([])
      return
    }
    const [first, last] = [dates[0], dates[dates.length - 1]]
    expect(examEventsBetween(first, last).length).toBe(EXAM_SCHEDULE.length)
    expect(examEventsBetween(first, first).every((c) => c.session_date === first)).toBe(true)
  })

  it('is empty for a window with no papers in it', () => {
    expect(examEventsBetween('1999-01-01', '1999-01-07')).toEqual([])
  })
})

describe('withEndTermExams()', () => {
  const rows = [dbRow()]

  it('leaves 1st-year (and unknown-year) views untouched', () => {
    expect(withEndTermExams(rows, 1)).toBe(rows)
    expect(withEndTermExams(rows, null)).toBe(rows)
  })

  it('returns the DB rows untouched while no papers are published', () => {
    expect(withEndTermExams(rows, 2)).toBe(rows)
  })

  it('appends every paper for the 2nd year', () => {
    const merged = withEndTermExams(rows, 2)
    expect(merged.length).toBe(rows.length + EXAM_SCHEDULE.length)
    expect(merged[0]).toBe(rows[0])
  })

  it('appends only the papers inside a fetched window', () => {
    const day = EXAM_SCHEDULE[0]?.date ?? '2026-12-01'
    const expected = EXAM_SCHEDULE.filter((e) => e.date === day).length
    const merged = withEndTermExams(rows, 2, day, day)
    expect(merged.length).toBe(rows.length + expected)
    expect(merged.slice(1).every((c) => c.session_date === day)).toBe(true)
  })

  it('keeps the sheet\'s own END TERM EXAMINATION banner (detail is additive)', () => {
    const banner = dbRow({ id: 'db-2', course_code: 'END_TERM_EXAMINATION', is_common: true, event_kind: 'exam', session_date: '2026-12-14' })
    expect(withEndTermExams([banner], 2)).toContain(banner)
  })
})

describe('isEndTermExam() / hasExamsOn()', () => {
  it('separates the static papers from sheet-derived rows', () => {
    expect(examEvents().every(isEndTermExam)).toBe(true)
    expect(isEndTermExam(dbRow())).toBe(false)
    expect(isEndTermExam(dbRow({ source_key: null }))).toBe(false)
  })

  it('knows which dates have papers', () => {
    for (const e of EXAM_SCHEDULE) expect(hasExamsOn(e.date), e.date).toBe(true)
    expect(hasExamsOn('1999-01-01')).toBe(false)
  })
})

describe('isMyExam()', () => {
  const events = examEvents()

  it('matches a paper the student is enrolled in, by any of its codes', () => {
    for (const [i, c] of events.entries()) {
      for (const code of EXAM_SCHEDULE[i].codes) {
        expect(isMyExam(c, new Set([code])), `${c.course_name} → ${code}`).toBe(true)
      }
      expect(isMyExam(c, new Set(['NOT-A-REAL-CODE'])), c.course_name!).toBe(false)
      expect(isMyExam(c, new Set()), c.course_name!).toBe(false)
    }
  })

  it('is false for anything that is not a static exam row', () => {
    expect(isMyExam(dbRow(), new Set(['CSL']))).toBe(false)
  })
})
