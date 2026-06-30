import type { Course, CellFormat, RawSheetData } from '@/lib/types'

// A fully-formed mock Course with sensible defaults; override what each test needs.
export function makeCourse(over: Partial<Course> = {}): Course {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    course_code: 'GT-A',
    course_name: 'Game Theory',
    instructor: 'Prof. X',
    day_of_week: 'TUE',
    session_date: '2026-06-09',
    start_time: '09:15',
    end_time: '10:30',
    room: 'D1',
    credits: '3',
    sheet_tab: 'PGP-29 D1',
    sheet_row_index: 5,
    is_cancelled: false,
    is_common: false,
    event_kind: 'class',
    change_kind: null,
    change_note: null,
    last_changed_at: null,
    last_synced_at: '2026-06-09T00:00:00Z',
    ...over,
  }
}

// Standard two-row header used by the real "Term IV Schedule" sheet:
//   row 0 = programme names, row 1 = division/section codes (D1, D2, E1, E2…).
// Body rows are [date, time, ...section cells]. Mirrors the live layout.
const HEADER: string[][] = [
  ['DATE', 'TIME', 'PGP-29', 'PGP-29', 'PGPFIN06', 'PGPLSM06'],
  ['', '', 'D1', 'D2', 'E1', 'E2'],
]

export function buildSheet(bodyRows: string[][], formatRows?: CellFormat[][]): RawSheetData {
  const sheet1 = [...HEADER, ...bodyRows]
  const data: RawSheetData = { sheet1, sheet2: [], fetched_at: '2026-06-09T00:00:00Z' }
  if (formatRows) {
    // Header rows carry no formatting; align indices with sheet1.
    const blank = (w: number): CellFormat[] => Array.from({ length: w }, () => ({ bgColor: null, strikethrough: false }))
    data.sheet1_format = [blank(6), blank(6), ...formatRows]
  }
  return data
}

// Convenience: a uniform "no formatting" row of N cells.
export function plainRow(width = 6): CellFormat[] {
  return Array.from({ length: width }, () => ({ bgColor: null, strikethrough: false }))
}

// A format row where the cell at `col` carries `fmt`, the rest plain.
export function fmtAt(col: number, fmt: CellFormat, width = 6): CellFormat[] {
  const row = plainRow(width)
  row[col] = fmt
  return row
}
