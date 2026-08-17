import { describe, it, expect } from 'vitest'
import {
  EXAM_SCHEDULE, SLOT_ORDER, EXAM_SOURCE_KEY,
  examEvents, examEventsBetween, hasExamsOn, isEndTermExam, isMyExam, withEndTermExams,
} from '@/lib/exams'
import type { Course } from '@/lib/types'

const SLOTS = ['Morning', 'Afternoon', 'Evening']

// A sheet-derived row, for the "not an end-term paper" cases.
const dbRow = (over: Partial<Course> = {}): Course => ({
  id: 'db-1', course_code: 'CG', course_name: 'Corporate Governance', instructor: null,
  day_of_week: 'TUE', session_date: '2026-08-20', start_time: '09:15', end_time: '10:30',
  room: 'D4', credits: '3', area: 'SM', sheet_tab: 'PGP-29 D4', sheet_row_index: 6,
  year: 2, source_key: 'y2', is_cancelled: false, is_common: false, event_kind: 'class',
  change_kind: null, change_note: null, last_changed_at: null, last_synced_at: '', ...over,
})

describe('EXAM_SCHEDULE data (transcribed from the Term IV end-term PDF)', () => {
  it('runs only on the eight published dates, 22–31 Aug 2026', () => {
    // 25 and 26 Aug carry no paper on the PDF.
    const dates = [...new Set(EXAM_SCHEDULE.map((e) => e.date))].sort()
    expect(dates).toEqual([
      '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-27',
      '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31',
    ])
  })

  it('has the paper count the PDF prints for each day', () => {
    const byDate: Record<string, number> = {}
    for (const e of EXAM_SCHEDULE) byDate[e.date] = (byDate[e.date] ?? 0) + 1
    expect(byDate).toEqual({
      '2026-08-22': 9, '2026-08-23': 5, '2026-08-24': 2, '2026-08-27': 6,
      '2026-08-28': 6, '2026-08-29': 9, '2026-08-30': 7, '2026-08-31': 4,
    })
    expect(EXAM_SCHEDULE.length).toBe(48)
  })

  it('gives every paper a known slot, a title and at least one course code', () => {
    for (const e of EXAM_SCHEDULE) {
      expect(SLOTS, e.title).toContain(e.slot)
      expect(e.title.trim().length, e.title).toBeGreaterThan(0)
      expect(e.codes.length, e.title).toBeGreaterThan(0)
      for (const c of e.codes) expect(c.trim().length, `${e.title} → "${c}"`).toBeGreaterThan(0)
    }
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
    const byDate = new Map(events.map((c) => [c.session_date, c.day_of_week]))
    expect(byDate.get('2026-08-22')).toBe('SAT')
    expect(byDate.get('2026-08-24')).toBe('MON')
    expect(byDate.get('2026-08-27')).toBe('THU')
    expect(byDate.get('2026-08-31')).toBe('MON')
  })

  it('returns the same objects each call (stable identity for SWR-derived arrays)', () => {
    expect(examEvents()).toBe(events)
  })
})

describe('examEventsBetween()', () => {
  it('is inclusive of both ends', () => {
    const week = examEventsBetween('2026-08-22', '2026-08-24')
    expect(new Set(week.map((c) => c.session_date))).toEqual(
      new Set(['2026-08-22', '2026-08-23', '2026-08-24'])
    )
    expect(week.length).toBe(9 + 5 + 2)
  })

  it('is empty for a window before the exams', () => {
    expect(examEventsBetween('2026-08-09', '2026-08-15')).toEqual([])
  })
})

describe('withEndTermExams()', () => {
  const rows = [dbRow()]

  it('leaves 1st-year (and unknown-year) views untouched', () => {
    expect(withEndTermExams(rows, 1)).toBe(rows)
    expect(withEndTermExams(rows, null)).toBe(rows)
  })

  it('appends every paper for the 2nd year', () => {
    const merged = withEndTermExams(rows, 2)
    expect(merged.length).toBe(rows.length + EXAM_SCHEDULE.length)
    expect(merged[0]).toBe(rows[0])
  })

  it('appends only the papers inside a fetched window', () => {
    const merged = withEndTermExams(rows, 2, '2026-08-31', '2026-08-31')
    expect(merged.length).toBe(rows.length + 4)
    expect(merged.slice(1).every((c) => c.session_date === '2026-08-31')).toBe(true)
  })

  it('keeps the sheet\'s own END TERM EXAMINATION banner (detail is additive)', () => {
    const banner = dbRow({ id: 'db-2', course_code: 'END_TERM_EXAMINATION', is_common: true, event_kind: 'exam', session_date: '2026-08-22' })
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
    expect(hasExamsOn('2026-08-22')).toBe(true)
    expect(hasExamsOn('2026-08-25')).toBe(false) // gap day on the PDF
    expect(hasExamsOn('2026-09-01')).toBe(false)
  })
})

describe('isMyExam()', () => {
  const events = examEvents()
  const paper = (title: string) => events.find((c) => c.course_name === title)!

  it('matches a paper the student is enrolled in, by any of its codes', () => {
    expect(isMyExam(paper('Negotiation & Conflict Management'), new Set(['NCM-B']))).toBe(true)
    expect(isMyExam(paper('Game Theory'), new Set(['GT-C', 'CG']))).toBe(true)
    // The PGP and FIN sections sit the same paper.
    expect(isMyExam(paper('Fixed Income Securities (PGP & FIN)'), new Set(['FIS (FIN-Core)']))).toBe(true)
  })

  it('does not match papers the student has not picked', () => {
    expect(isMyExam(paper('Game Theory'), new Set(['CG', 'SCM']))).toBe(false)
    expect(isMyExam(paper('Game Theory'), new Set())).toBe(false)
  })

  it('is false for anything that is not a static exam row', () => {
    expect(isMyExam(dbRow(), new Set(['CG']))).toBe(false)
  })
})
