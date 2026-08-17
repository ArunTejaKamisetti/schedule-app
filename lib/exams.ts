// Term IV End-Term Examination schedule — PGP29 / PGPLSM06 / PGPFIN06 (2nd year), Aug 2026.
//
// Transcribed from the Programmes Office PDF ("SCHEDULE OF TERM IV END TERM EXAMINATION"), which
// is NOT in the Google Sheet the sync reads. The sheet only carries a whole-day "END TERM
// EXAMINATION" banner for 22–31 Aug; these rows add the per-paper detail on top of it.
//
// Static data in the repo (same idea as lib/mess.ts / lib/bus.ts): the events are synthesised as
// `Course` rows client-side, so no DB write or sync change is needed. They are common events
// (amber/orange in every view) shown to the whole 2nd year.
//
// The PDF publishes SLOTS (Morning / Afternoon / Evening), not clock times. So each row carries a
// `time_label` that the UI shows in place of a time; the start_time below is an ordering
// placeholder only and is never displayed as the exam's start.

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
export const EXAM_SOURCE_KEY = 'endterm-t4'

export const EXAM_NOTE =
  'Report 5 minutes before the exam starts; you will not be allowed in after the reporting time. ' +
  'Carry your Institute ID card. Exact timings and rooms are as notified by the Programmes Office.'

export const EXAM_SCHEDULE: ExamEntry[] = [
  // 22.08.2026
  { date: '2026-08-22', slot: 'Morning', title: 'Economics of Market Power and Competition (PGP & FIN)', codes: ['EMPC', 'EMPC (FIN)'] },
  { date: '2026-08-22', slot: 'Morning', title: 'Micro Finance (FIN)', codes: ['MF (FIN)'] },
  { date: '2026-08-22', slot: 'Morning', title: 'Negotiation & Conflict Management', codes: ['NCM-A', 'NCM-B'] },
  { date: '2026-08-22', slot: 'Afternoon', title: 'Managing Business with Generative and Agentic AI (PGP & LSM)', codes: ['MBGAI', 'MBGAI (LSM)'] },
  { date: '2026-08-22', slot: 'Afternoon', title: 'E-Commerce', codes: ['ECOM'] },
  { date: '2026-08-22', slot: 'Afternoon', title: 'Decoding Web 3.0', codes: ['DW3.0'] },
  { date: '2026-08-22', slot: 'Afternoon', title: 'Supply Chain Management', codes: ['SCM'] },
  { date: '2026-08-22', slot: 'Evening', title: 'Labour Law & IR', codes: ['LLIR'] },
  { date: '2026-08-22', slot: 'Evening', title: 'Managing Business Markets', codes: ['MBM', 'MBM\n(22.00-00.15)'] },

  // 23.08.2026
  { date: '2026-08-23', slot: 'Morning', title: 'Visual Culture: Understanding Images', codes: ['VC'] },
  { date: '2026-08-23', slot: 'Morning', title: 'Strategic Thinking (FIN-Core)', codes: ['ST (FIN-Core)'] },
  { date: '2026-08-23', slot: 'Afternoon', title: 'Management of IT Products and Services', codes: ['MITPS'] },
  { date: '2026-08-23', slot: 'Afternoon', title: 'Marketing Research for BDM', codes: ['MRBDM'] },
  { date: '2026-08-23', slot: 'Evening', title: 'Intimacy, Love, and the Market: A Sociological Overview', codes: ['ILM-A', 'ILM-B'] },

  // 24.08.2026
  { date: '2026-08-24', slot: 'Morning', title: 'Qualitative Inquiry (LSM-Core)', codes: ['QI (LSM-Core)'] },
  { date: '2026-08-24', slot: 'Afternoon', title: 'Global Business Strategy', codes: ['GBS-A', 'GBS-B'] },

  // 27.08.2026
  { date: '2026-08-27', slot: 'Morning', title: 'Women in Indian Society: A Sociological Overview', codes: ['WIS-A', 'WIS-B'] },
  { date: '2026-08-27', slot: 'Morning', title: 'Project Finance (FIN-Core)', codes: ['PF (FIN-Core)'] },
  { date: '2026-08-27', slot: 'Afternoon', title: 'Intellectual Property Rights', codes: ['IPR'] },
  { date: '2026-08-27', slot: 'Afternoon', title: 'Strategic Business and Risk Analysis', codes: ['SBRA'] },
  { date: '2026-08-27', slot: 'Evening', title: 'Leadership: Inspiration, Dilemmas & Action', codes: ['LIDA'] },
  { date: '2026-08-27', slot: 'Evening', title: 'Good Data, Bad Data', codes: ['GDBD'] },

  // 28.08.2026
  { date: '2026-08-28', slot: 'Morning', title: 'Financial Derivatives', codes: ['FD'] },
  { date: '2026-08-28', slot: 'Morning', title: 'Law, Management and Entrepreneurship', codes: ['LME'] },
  { date: '2026-08-28', slot: 'Morning', title: 'Data Analytics Using R', codes: ['DAR'] },
  { date: '2026-08-28', slot: 'Afternoon', title: 'Fixed Income Securities (PGP & FIN)', codes: ['FIS', 'FIS (FIN-Core)'] },
  { date: '2026-08-28', slot: 'Afternoon', title: 'Humanitarian Supply Chain Management (LSM)', codes: ['HSCM (LSM)'] },
  { date: '2026-08-28', slot: 'Evening', title: 'Investment Analysis and Portfolio Management', codes: ['IAPM-A', 'IAPM-B'] },

  // 29.08.2026
  { date: '2026-08-29', slot: 'Morning', title: 'Political Science & Management (LSM-Core)', codes: ['PSM (LSM-Core)'] },
  { date: '2026-08-29', slot: 'Morning', title: 'Corporate Governance', codes: ['CG'] },
  { date: '2026-08-29', slot: 'Morning', title: 'Project Management', codes: ['PM'] },
  { date: '2026-08-29', slot: 'Morning', title: 'Digital Advertising', codes: ['DA'] },
  { date: '2026-08-29', slot: 'Afternoon', title: 'Cyber Security', codes: ['CS'] },
  { date: '2026-08-29', slot: 'Afternoon', title: 'Patterns of Strategy and Sports', codes: ['POSS'] },
  { date: '2026-08-29', slot: 'Afternoon', title: 'Enterprise IT Risk Management', codes: ['EITRM'] },
  { date: '2026-08-29', slot: 'Evening', title: 'Service Operations Management', codes: ['SOM'] },
  { date: '2026-08-29', slot: 'Evening', title: 'Retail Management', codes: ['RTM'] },

  // 30.08.2026
  { date: '2026-08-30', slot: 'Morning', title: 'Managing from the Inside Out: A Journey of Action & Reflection', codes: ['MIO'] },
  { date: '2026-08-30', slot: 'Morning', title: 'Corporate Valuation (PGP)', codes: ['CV'] },
  { date: '2026-08-30', slot: 'Afternoon', title: 'Customer Analytics', codes: ['CA'] },
  { date: '2026-08-30', slot: 'Afternoon', title: 'Marketing Automation & Agentic Systems', codes: ['MAAS'] },
  { date: '2026-08-30', slot: 'Afternoon', title: 'Corporate Valuation (FIN)', codes: ['CV (FIN-Core)'] },
  { date: '2026-08-30', slot: 'Afternoon', title: 'Consumer Behaviour', codes: ['CB'] },
  { date: '2026-08-30', slot: 'Evening', title: 'Globalisation and Culture', codes: ['GC-A', 'GC-B', 'GC-C'] },

  // 31.08.2026
  { date: '2026-08-31', slot: 'Morning', title: 'Game Theory', codes: ['GT-A', 'GT-B', 'GT-C'] },
  { date: '2026-08-31', slot: 'Afternoon', title: 'Financial Crisis (PGP & FIN)', codes: ['FC', 'FC (FIN)', 'FC (19.15-20.30)', 'FC (20.45-22.00)'] },
  { date: '2026-08-31', slot: 'Afternoon', title: 'Politics of Food', codes: ['POF'] },
  { date: '2026-08-31', slot: 'Evening', title: 'Commercial Bank Management', codes: ['CBM'] },
]

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
