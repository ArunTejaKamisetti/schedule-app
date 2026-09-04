// End-Term Examination schedule — PGP29 / PGPLSM06 / PGPFIN06 (2nd year).
//
// Transcribed from the Programmes Office PDF ("SCHEDULE OF ... END TERM EXAMINATION"), which is
// NOT in the Google Sheet the sync reads. The sheet only carries a whole-day "END TERM
// EXAMINATION" banner; these rows add the per-paper detail on top of it.
//
// Static data in the repo (same idea as lib/mess.ts / lib/bus.ts): the events are synthesised as
// `Course` rows client-side, so no DB write or sync change is needed. They are common events
// (amber/orange in every view) shown to the whole 2nd year.
//
// The PDF publishes SLOTS (Morning / Afternoon / Evening), not clock times. So each row carries a
// `time_label` that the UI shows in place of a time; the start_time below is an ordering
// placeholder only and is never displayed as the exam's start.
//
// EXAM_SCHEDULE is EMPTY between terms — every helper below degrades to a no-op, so the app
// simply shows the sheet's own exam banner until the next term's papers are transcribed.

import type { Course } from './types'

export type ExamSlot = 'Morning' | 'Afternoon' | 'Evening'

export interface ExamEntry {
  date: string      // ISO (YYYY-MM-DD)
  slot: ExamSlot
  title: string     // paper name exactly as printed in the PDF
  codes: string[]   // catalog course codes this paper belongs to (for the "YOURS" badge)
}

// Ordering placeholders — see the note above. Kept round (not a canonical class slot) so they
// never read as a published start time.
export const SLOT_ORDER: Record<ExamSlot, string> = {
  Morning: '09:00',
  Afternoon: '14:00',
  Evening: '18:00',
}

// Marks the synthesised rows so the UI can tell them apart from sheet-derived rows.
export const EXAM_SOURCE_KEY = 'endterm'

export const EXAM_NOTE =
  'Report 5 minutes before the exam starts; you will not be allowed in after the reporting time. ' +
  'Carry your Institute ID card. Exact timings and rooms are as notified by the Programmes Office.'

// No papers published yet for Term V. Term IV’s end-term list (22–31 Aug 2026) was removed when
// the term closed. When the Programmes Office publishes the Term V schedule, transcribe it here
// and everything below (rows, badges, Today/Week rendering, the calendar feed) lights up again.
export const EXAM_SCHEDULE: ExamEntry[] = []

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function weekdayOf(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? ''
}

// Built once: the same object identities every call, so the SWR-derived arrays that append them
// stay referentially stable across renders.
const EXAM_COURSES: Course[] = EXAM_SCHEDULE.map((e, i) => ({
  id: `${EXAM_SOURCE_KEY}-${e.date}-${e.slot.toLowerCase()}-${i}`,
  course_code: e.codes[0] ?? e.title,
  course_name: e.title,
  instructor: null,
  day_of_week: weekdayOf(e.date),
  session_date: e.date,
  start_time: SLOT_ORDER[e.slot],
  end_time: null,
  time_label: e.slot,
  room: null,
  credits: null,
  area: null,
  sheet_tab: 'COMMON',
  sheet_row_index: null,
  year: 2,
  source_key: EXAM_SOURCE_KEY,
  is_cancelled: false,
  is_common: true,
  event_kind: 'exam',
  change_kind: null,
  change_note: null,
  last_changed_at: null,
  last_synced_at: '',
}))

const CODES_BY_ID = new Map(EXAM_COURSES.map((c, i) => [c.id, EXAM_SCHEDULE[i].codes]))
const EXAM_DATES = new Set(EXAM_SCHEDULE.map((e) => e.date))

// Every end-term paper, as common `Course` rows.
export function examEvents(): Course[] {
  return EXAM_COURSES
}

// The papers falling inside an inclusive ISO date window (the weekly schedule fetches a window).
export function examEventsBetween(from: string, to: string): Course[] {
  return EXAM_COURSES.filter((c) => c.session_date! >= from && c.session_date! <= to)
}

// A row synthesised from the PDF (vs. a real sheet-derived row from the DB).
export function isEndTermExam(c: { source_key?: string | null }): boolean {
  return c.source_key === EXAM_SOURCE_KEY
}

export function hasExamsOn(iso: string): boolean {
  return EXAM_DATES.has(iso)
}

// Is this exam one the student sits? True when they've picked any course the paper covers.
export function isMyExam(c: Course, myCodes: Set<string>): boolean {
  const codes = CODES_BY_ID.get(c.id)
  if (!codes) return false
  return codes.some((code) => myCodes.has(code))
}

// Append the end-term papers to a list of DB rows. 1st-years don't sit this exam, so their views
// are left untouched. `from`/`to` scope the append to a fetched window.
export function withEndTermExams(
  rows: Course[], year: number | null | undefined, from?: string, to?: string
): Course[] {
  if (year !== 2) return rows
  const exams = from && to ? examEventsBetween(from, to) : EXAM_COURSES
  return exams.length === 0 ? rows : [...rows, ...exams]
}
