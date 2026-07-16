import { describe, it, expect } from 'vitest'
import {
  parseSheetRows, getBaseAbbr, getDetailAbbr, classifyColor, rgbToHex,
  parseCourseDetails, parseFullDate, detailKey, cleanCode, normalizeScheduleCode,
} from '@/lib/sheets'
import { DEFAULT_PROFILE } from '@/lib/institution-profile'
import { buildSheet, fmtAt, plainRow } from './helpers'
import type { CellFormat, SheetMerge } from '@/lib/types'

// Build a 1st-year "section" layout schedule: a room row directly above a "Sec A…" header row,
// then body rows of [date, time, ...section cells]. Mirrors the real A–H sheet.
function buildSection(opts: {
  rooms: string[]; sections: string[]; body: string[][]
  fmt?: Record<string, string>   // "row,col" → bg hex, where row indexes the BODY (0-based)
  merges?: SheetMerge[]
}) {
  const width = 2 + opts.sections.length
  const roomRow = ['', '', ...opts.rooms]
  const headerRow = ['', '', ...opts.sections.map((s) => `Sec ${s}`)]
  const rows = [roomRow, headerRow, ...opts.body]
  const blank = (): CellFormat[] => Array.from({ length: width }, () => ({ bgColor: null, strikethrough: false }))
  const format: CellFormat[][] = rows.map(() => blank())
  for (const [k, hex] of Object.entries(opts.fmt ?? {})) {
    const [r, c] = k.split(',').map(Number)
    format[2 + r][c] = { bgColor: hex, strikethrough: false }
  }
  return { rows, format, merges: opts.merges }
}

// Build a NEW-format 1st-year "section-in-cell" schedule: a single classroom-header row ("CR A1"…)
// with NO "Sec X" row, then body rows of [date, time, ...cells] where each cell is "<course>-<section>"
// (e.g. "ME-Fin", "DA-B"). Mirrors the merged PGP30/FIN07/LSM07 sheet.
function buildRoomGrid(opts: {
  rooms: string[]; body: string[][]
  fmt?: Record<string, string>   // "row,col" → bg hex, where row indexes the BODY (0-based)
  merges?: SheetMerge[]
}) {
  const width = 2 + opts.rooms.length
  const headerRow = ['Date', 'Time', ...opts.rooms]
  const rows = [headerRow, ...opts.body]
  const blank = (): CellFormat[] => Array.from({ length: width }, () => ({ bgColor: null, strikethrough: false }))
  const format: CellFormat[][] = rows.map(() => blank())
  for (const [k, hex] of Object.entries(opts.fmt ?? {})) {
    const [r, c] = k.split(',').map(Number)
    format[1 + r][c] = { bgColor: hex, strikethrough: false }
  }
  return { rows, format, merges: opts.merges }
}

describe('parseSheetRows — schedule matrix', () => {
  it('parses a normal class row: date, time, room=section, sheet_tab', () => {
    const data = buildSheet([
      ['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', 'IAPM-A', 'ST (FIN-Core)', 'PSM (LSM-Core)'],
    ])
    const rows = parseSheetRows(data.sheet1)
    expect(rows).toHaveLength(4)
    const gt = rows.find((r) => r.course_code === 'GT-A')!
    expect(gt.session_date).toBe('2026-06-09')
    expect(gt.start_time).toBe('09:15')
    expect(gt.end_time).toBe('10:30')
    expect(gt.room).toBe('D1')          // the division code IS the room
    expect(gt.sheet_tab).toBe('D1')     // identity = the division code ALONE (not "PGP-29 D1")
    expect(gt.day_of_week).toBe('TUE')
    expect(gt.is_common).toBe(false)
    expect(gt.event_kind).toBe('class')
  })

  it('keys each column by its division code ALONE, ignoring the programme row above it', () => {
    const data = buildSheet([
      ['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', 'IAPM-A', 'ST (FIN-Core)', 'PSM (LSM-Core)'],
    ])
    const rows = parseSheetRows(data.sheet1)
    // sheet_tab is the LAST header row (E1/E2), NOT "PGPFIN06 E1" — so editing the programme row
    // never re-keys a class (that was the mass-phantom-"Moved" bug).
    expect(rows.find((r) => r.course_code === 'ST (FIN-Core)')!.sheet_tab).toBe('E1')
    expect(rows.find((r) => r.course_code === 'PSM (LSM-Core)')!.sheet_tab).toBe('E2')
  })

  it('parses dotted, colon and spaced time ranges identically', () => {
    for (const t of ['09.15-10.30', '09:15-10:30', '9.15 - 10.30']) {
      const data = buildSheet([['Tuesday, 9 June, 2026', t, 'GT-A', '', '', '']])
      const gt = parseSheetRows(data.sheet1)[0]
      expect([gt.start_time, gt.end_time]).toEqual(['09:15', '10:30'])
    }
  })

  it('skips filler cells (LUNCH BREAK, MEETING, REGISTRATION) and empty cells', () => {
    const data = buildSheet([
      ['Wednesday, 10 June, 2026', '13.30-14.30', 'LUNCH BREAK', '', '', ''],
      ['Wednesday, 10 June, 2026', '09.15-10.30', 'MEETING', 'CB', '', ''],
    ])
    const rows = parseSheetRows(data.sheet1)
    const codes = rows.map((r) => r.course_code)
    expect(codes).toContain('CB')
    expect(codes).not.toContain('LUNCH BREAK')
    expect(codes).not.toContain('MEETING')
    expect(codes).not.toContain('')
  })

  it('captures an exam row as a common event for everyone', () => {
    const data = buildSheet([
      ['Saturday, 11 July, 2026', '09.00-12.00', 'MID TERM EXAMINATION', '', '', ''],
    ])
    const rows = parseSheetRows(data.sheet1)
    const exam = rows.find((r) => r.is_common)
    expect(exam).toBeDefined()
    expect(exam!.event_kind).toBe('exam')
    expect(exam!.session_date).toBe('2026-07-11')
    expect(exam!.sheet_tab).toBe('COMMON')
  })

  it('spans a merged multi-day exam banner across its blank dated rows', () => {
    const data = buildSheet([
      ['Saturday, 22 August, 2026', '', 'END TERM EXAMINATION', '', '', ''],
      ['Sunday, 23 August, 2026', '', '', '', '', ''],
      ['Monday, 24 August, 2026', '', '', '', '', ''],
    ])
    const exams = parseSheetRows(data.sheet1).filter((r) => r.is_common)
    const dates = exams.map((e) => e.session_date).sort()
    expect(dates).toEqual(['2026-08-22', '2026-08-23', '2026-08-24'])
  })

  // Regression: an amber "MDP Programme" cell merged vertically over ONE section column
  // (blocking that classroom for several days) must not swallow the anchor row's classes.
  it('parses classes alongside an amber block confined to one section column', () => {
    const body = [
      ['Friday, 17 July, 2026', '09.15-10.30', 'CONSULTING', 'SDM', 'ST (FIN-Core)', 'MDP Programme'],
      ['Friday, 17 July, 2026', '10.45-12.00', 'GT-A', 'IAPM-A', 'PSM (LSM-Core)', ''],
      ['Saturday, 18 July, 2026', '09.15-10.30', '', '', '', ''],
    ]
    const data = buildSheet(body, [fmtAt(5, { bgColor: '#ffc000', strikethrough: false }), plainRow(), plainRow()])
    const merges: SheetMerge[] = [{ startRow: 2, endRow: 5, startCol: 5, endCol: 6 }] // E2 column, both days
    const parsed = parseSheetRows(data.sheet1, { format: data.sheet1_format, merges })

    const classes = parsed.filter((r) => !r.is_common).map((r) => r.course_code)
    expect(classes.sort()).toEqual(['CONSULTING', 'GT-A', 'IAPM-A', 'PSM (LSM-Core)', 'SDM', 'ST (FIN-Core)'])

    const events = parsed.filter((r) => r.is_common)
    expect(events.map((e) => e.session_date).sort()).toEqual(['2026-07-17', '2026-07-18'])
    expect(events[0].course_name).toBe('MDP Programme (E2)')   // common event, tagged with the room
    expect(events[0].event_kind).toBe('event')
    expect(events[0].sheet_tab).toBe('COMMON')
    expect(events[0].room).toBe('E2')
  })

  // Regression: a Quizzes banner row that sits INSIDE another block's row range must take its
  // dates from its OWN merge, not the enclosing block's (which spans more days).
  it('an event banner inside a column block’s row range keeps its own dates', () => {
    const body = [
      ['Thursday, 23 July, 2026', '09.15-10.30', 'FC', 'MITPS', 'FIS (FIN-Core)', 'MDP Programme'],
      ['Thursday, 23 July, 2026', '14.30-15.45', 'Quizzes', '', '', ''],
      ['Friday, 24 July, 2026', '09.15-10.30', 'CONSULTING', 'SDM', 'ST (FIN-Core)', ''],
      ['Friday, 24 July, 2026', '14.30-15.45', 'GT-C', 'GC-A', 'EITRM', ''],
    ]
    const data = buildSheet(body, [
      fmtAt(5, { bgColor: '#ffc000', strikethrough: false }),
      fmtAt(2, { bgColor: '#ffc000', strikethrough: false }),
      plainRow(), plainRow(),
    ])
    const merges: SheetMerge[] = [
      { startRow: 2, endRow: 6, startCol: 5, endCol: 6 }, // MDP block: E2 column, both days
      { startRow: 3, endRow: 4, startCol: 2, endCol: 5 }, // Quizzes banner: one row, cols D1-E1
    ]
    const parsed = parseSheetRows(data.sheet1, { format: data.sheet1_format, merges })
    const quizzes = parsed.filter((r) => r.is_common && /quiz/i.test(r.course_name))
    expect(quizzes.map((q) => q.session_date)).toEqual(['2026-07-23']) // NOT also the 24th
    expect(quizzes[0].course_name).toBe('Quizzes')                    // majority width → no room suffix
    // Friday's classes at both slots are intact.
    const friday = parsed.filter((r) => !r.is_common && r.session_date === '2026-07-24').map((r) => r.course_code)
    expect(friday.sort()).toEqual(['CONSULTING', 'EITRM', 'GC-A', 'GT-C', 'SDM', 'ST (FIN-Core)'])
  })

  it('still treats a full-width amber merge as a whole-row banner', () => {
    const body = [
      ['Monday, 20 July, 2026', '09.15-10.30', 'FOUNDATION DAY', '', '', ''],
      ['Tuesday, 21 July, 2026', '09.15-10.30', '', '', '', ''],
    ]
    const data = buildSheet(body, [fmtAt(2, { bgColor: '#ffc000', strikethrough: false }), plainRow()])
    const merges: SheetMerge[] = [{ startRow: 2, endRow: 4, startCol: 2, endCol: 6 }] // all section columns
    const parsed = parseSheetRows(data.sheet1, { format: data.sheet1_format, merges })
    expect(parsed.filter((r) => !r.is_common)).toHaveLength(0)
    const events = parsed.filter((r) => r.is_common)
    expect(events[0].course_name).toBe('FOUNDATION DAY')       // no room suffix on banners
    expect(events.map((e) => e.session_date).sort()).toEqual(['2026-07-20', '2026-07-21'])
  })

  it('drops rows with an unparseable date', () => {
    const data = buildSheet([['No date here', '09.15-10.30', 'GT-A', '', '', '']])
    expect(parseSheetRows(data.sheet1)).toHaveLength(0)
  })

  it('drops a normal class row with no time (only exams may be timeless)', () => {
    const data = buildSheet([['Tuesday, 9 June, 2026', '', 'GT-A', '', '', '']])
    expect(parseSheetRows(data.sheet1)).toHaveLength(0)
  })
})

describe('parseSheetRows — section layout (1st year)', () => {
  it('parses Sec A–B classes: code, room from the row above, sheet_tab = section letter', () => {
    const { rows, format } = buildSection({
      rooms: ['CR A1', 'CR B2'],
      sections: ['A', 'B'],
      body: [['Tuesday, January 6, 2026', '09.15-10.30', 'SM', 'GT']],
    })
    const parsed = parseSheetRows(rows, { layout: 'section', format })
    const sm = parsed.find((r) => r.course_code === 'SM')!
    expect(sm.sheet_tab).toBe('A')
    expect(sm.room).toBe('CR A1')
    expect(sm.session_date).toBe('2026-01-06')   // month-first date
    expect(sm.start_time).toBe('09:15')
    expect(sm.day_of_week).toBe('TUE')
    expect(sm.is_common).toBe(false)
    const gt = parsed.find((r) => r.course_code === 'GT')!
    expect(gt.sheet_tab).toBe('B')
    expect(gt.room).toBe('CR B2')
  })

  it('keeps SESS as a real class (not filtered)', () => {
    const { rows, format } = buildSection({
      rooms: ['CR A1', 'CR B2'], sections: ['A', 'B'],
      body: [['Tuesday, January 6, 2026', '11.00-12.15', 'SESS', 'GT']],
    })
    const parsed = parseSheetRows(rows, { layout: 'section', format })
    expect(parsed.find((r) => r.course_code === 'SESS')?.sheet_tab).toBe('A')
  })

  it('emits an amber holiday as a common event spanning its merged dates', () => {
    const { rows, format, merges } = buildSection({
      rooms: ['CR A1', 'CR B2'], sections: ['A', 'B'],
      body: [
        ['Monday, January 26, 2026', '', 'REPUBLIC DAY', ''],
        ['Tuesday, January 27, 2026', '', '', ''],
      ],
      fmt: { '0,2': '#ffc000' },                       // amber at body row 0, col 2
      merges: [{ startRow: 2, endRow: 4, startCol: 2, endCol: 4 }],
    })
    const events = parseSheetRows(rows, { layout: 'section', format, merges }).filter((r) => r.is_common)
    expect(events.every((e) => e.event_kind === 'event')).toBe(true)
    expect(events.map((e) => e.session_date).sort()).toEqual(['2026-01-26', '2026-01-27'])
    expect(events[0].course_name).toBe('REPUBLIC DAY')
    expect(events[0].sheet_tab).toBe('COMMON')
  })

  it('spans a merged END TERM EXAMINATION banner across its dates (by text, no colour needed)', () => {
    const { rows, format, merges } = buildSection({
      rooms: ['CR A1', 'CR B2'], sections: ['A', 'B'],
      body: [
        ['Saturday, May 9, 2026', '', 'END TERM EXAMINATION', ''],
        ['Sunday, May 10, 2026', '', '', ''],
        ['Monday, May 11, 2026', '', '', ''],
      ],
      merges: [{ startRow: 2, endRow: 5, startCol: 2, endCol: 4 }],
    })
    const exams = parseSheetRows(rows, { layout: 'section', format, merges }).filter((r) => r.is_common)
    expect(exams.every((e) => e.event_kind === 'exam')).toBe(true)
    expect(exams.map((e) => e.session_date).sort()).toEqual(['2026-05-09', '2026-05-10', '2026-05-11'])
  })
})

describe('parseSheetRows — section-in-cell layout (new 1st-year format)', () => {
  it('auto-detects classroom headers and reads the section from each cell suffix', () => {
    const { rows } = buildRoomGrid({
      rooms: ['CR A1', 'CR A2', 'CR B3'],
      body: [['Monday, June 29, 2026', '09.15-10.30', 'ME-Fin', 'DA-B', 'BC-LSM']],
    })
    const parsed = parseSheetRows(rows, { layout: 'section' })
    // course_code = bare code; sheet_tab = section UPPER-cased (matches roster normalizeSection);
    // room = the classroom column header. Same ParsedCourse shape as the legacy column layout.
    expect(parsed.map((p) => [p.course_code, p.sheet_tab, p.room])).toEqual([
      ['ME', 'FIN', 'CR A1'],
      ['DA', 'B', 'CR A2'],
      ['BC', 'LSM', 'CR B3'],
    ])
    const me = parsed.find((p) => p.course_code === 'ME')!
    expect(me.session_date).toBe('2026-06-29')
    expect(me.start_time).toBe('09:15')
    expect(me.end_time).toBe('10:30')
    expect(me.day_of_week).toBe('MON')
    expect(me.is_common).toBe(false)
    expect(me.event_kind).toBe('class')
  })

  it('keys a section by its identity even when it sits in different rooms across the day', () => {
    const { rows } = buildRoomGrid({
      rooms: ['CR A1', 'CR A2'],
      body: [
        ['Monday, June 29, 2026', '09.15-10.30', 'ME-B', 'DA-C'],
        ['Monday, June 29, 2026', '10.50-12.05', 'FA-B', 'DA-C'],
      ],
    })
    const secB = parseSheetRows(rows, { layout: 'section' }).filter((p) => p.sheet_tab === 'B')
    expect(secB.map((p) => [p.start_time, p.room, p.course_code])).toEqual([
      ['09:15', 'CR A1', 'ME'],   // section B in CR A1 first slot
      ['10:50', 'CR A1', 'FA'],   // section B in CR A1 second slot (different course, same room here)
    ])
  })

  it('skips filler cells (LUNCH BREAK) and empty cells', () => {
    const { rows } = buildRoomGrid({
      rooms: ['CR A1', 'CR A2'],
      body: [['Monday, June 29, 2026', '13.40-14.40', 'LUNCH BREAK', '']],
    })
    expect(parseSheetRows(rows, { layout: 'section' })).toHaveLength(0)
  })

  it('emits an exam banner as a common event across its merged dates', () => {
    const { rows, format, merges } = buildRoomGrid({
      rooms: ['CR A1', 'CR A2'],
      body: [
        ['Saturday, July 11, 2026', '', 'MID TERM EXAMINATION', ''],
        ['Sunday, July 12, 2026', '', '', ''],
      ],
      merges: [{ startRow: 1, endRow: 3, startCol: 2, endCol: 4 }],
    })
    const exams = parseSheetRows(rows, { layout: 'section', format, merges }).filter((r) => r.is_common)
    expect(exams.every((e) => e.event_kind === 'exam')).toBe(true)
    expect(exams.map((e) => e.session_date).sort()).toEqual(['2026-07-11', '2026-07-12'])
    expect(exams[0].sheet_tab).toBe('COMMON')
  })

  // Regression (shared tryRowEvent): an amber block over ONE classroom column must not swallow
  // the other rooms' classes in its anchor row, and is tagged with the blocked room.
  it('parses classes alongside an amber block confined to one classroom column', () => {
    const { rows, format, merges } = buildRoomGrid({
      rooms: ['CR A1', 'CR A2'],
      body: [
        ['Monday, June 29, 2026', '09.15-10.30', 'ME-Fin', 'MDP Programme'],
        ['Tuesday, June 30, 2026', '09.15-10.30', 'DA-B', ''],
      ],
      fmt: { '0,3': '#ffc000' },                        // amber at body row 0, col 3 (CR A2)
      merges: [{ startRow: 1, endRow: 3, startCol: 3, endCol: 4 }], // CR A2 column, both days
    })
    const parsed = parseSheetRows(rows, { layout: 'section', format, merges })
    const classes = parsed.filter((r) => !r.is_common).map((r) => [r.course_code, r.sheet_tab])
    expect(classes.sort()).toEqual([['DA', 'B'], ['ME', 'FIN']])   // anchor-row ME-Fin survives
    const events = parsed.filter((r) => r.is_common)
    expect(events.map((e) => e.session_date).sort()).toEqual(['2026-06-29', '2026-06-30'])
    expect(events[0].course_name).toBe('MDP Programme (CR A2)')
    expect(events[0].room).toBe('CR A2')
  })

  it('preserves an unrecognised cell (no declared section suffix), keyed by its room', () => {
    const { rows } = buildRoomGrid({
      rooms: ['CR A1', 'CR A2'],
      body: [['Monday, June 29, 2026', '09.15-10.30', 'WORKSHOP-XYZ', 'DA-B']],
    })
    const parsed = parseSheetRows(rows, { layout: 'section' })
    const w = parsed.find((p) => p.course_code === 'WORKSHOP-XYZ')!
    expect(w).toBeTruthy()             // not mis-split, not dropped
    expect(w.sheet_tab).toBe('CR A1')  // fallback: preserved, keyed by room
  })

  it('honours an explicit sectionSource="cell" via the profile', () => {
    const profile = { ...DEFAULT_PROFILE, sections: { ...DEFAULT_PROFILE.sections, sectionSource: 'cell' as const } }
    const { rows } = buildRoomGrid({
      rooms: ['CR A1', 'CR A2'],
      body: [['Monday, June 29, 2026', '09.15-10.30', 'ME-Fin', 'DA-B']],
    })
    const parsed = parseSheetRows(rows, { layout: 'section', profile })
    expect(parsed.find((p) => p.course_code === 'ME')).toMatchObject({ sheet_tab: 'FIN', room: 'CR A1' })
  })
})

describe('parseFullDate — day-first and month-first', () => {
  it('parses day-first (2nd-year sheet)', () => {
    expect(parseFullDate('Tuesday, 9 June, 2026')).toBe('2026-06-09')
  })
  it('parses month-first (1st-year sheet)', () => {
    expect(parseFullDate('Tuesday, January 6, 2026')).toBe('2026-01-06')
    expect(parseFullDate('Monday, January 26, 2026')).toBe('2026-01-26')
  })
  it('returns empty for an unparseable date', () => {
    expect(parseFullDate('No date here')).toBe('')
  })
})

describe('classifyColor — amber events distinct from cancellations', () => {
  it('classifies amber/orange as event (not red)', () => {
    expect(classifyColor('#ffc000')).toBe('event')
    expect(classifyColor('#ff9900')).toBe('event')
  })
  it('keeps saturated and light reds as red', () => {
    expect(classifyColor('#ff0000')).toBe('red')
    expect(classifyColor('#f4cccc')).toBe('red')   // light red 3 — high blue, not amber
  })
})

describe('parseCourseDetails — section layout (faculty per section group)', () => {
  const sheet2 = [
    ['Course', 'Abbr', 'Credit', 'Section Allocation', 'Faculty'],
    ['Strategic Management', 'SM', '3', 'AB', 'Prof. Rameshan'],
    ['', '', '', 'CD', 'Prof. Nandakumar'],
  ]
  it('keys faculty by (abbr, section) while name/credit come from the abbr row', () => {
    const map = parseCourseDetails(sheet2, 'section')
    expect(map.get('SM|A')?.faculty).toBe('Prof. Rameshan')
    expect(map.get('SM|B')?.faculty).toBe('Prof. Rameshan')
    expect(map.get('SM|C')?.faculty).toBe('Prof. Nandakumar')
    expect(map.get('SM|D')?.faculty).toBe('Prof. Nandakumar')
    expect(map.get('SM')?.name).toBe('Strategic Management')
    expect(map.get('SM')?.credits).toBe('3')
  })
  it('detailKey targets ABBR|SECTION with an ABBR fallback', () => {
    expect(detailKey('SM', 'A', 'section')).toEqual({ primary: 'SM|A', fallback: 'SM' })
    expect(detailKey('GT-A', 'B', 'division').primary).toBe('GT')
  })
})

describe('parseCourseDetails — multi-char section allocation (Fin/LSM)', () => {
  const sheet2 = [
    ['Course', 'Abbr', 'Credit', 'Section Allocation', 'Faculty'],
    ['Managerial Economics', 'ME', '3', 'Fin', 'Prof. A'],
    ['', '', '', 'LSM', 'Prof. B'],
    ['Data Analytics', 'DA', '3', 'A, B', 'Prof. C'],
  ]
  it('keys multi-char sections as whole tokens (never F/I/N)', () => {
    const map = parseCourseDetails(sheet2, 'section')
    expect(map.get('ME|FIN')?.faculty).toBe('Prof. A')
    expect(map.get('ME|LSM')?.faculty).toBe('Prof. B')
    expect(map.get('DA|A')?.faculty).toBe('Prof. C')
    expect(map.get('DA|B')?.faculty).toBe('Prof. C')
    expect(map.get('ME')?.name).toBe('Managerial Economics')
    // the bug guard: no phantom single-letter keys from "Fin"
    expect(map.get('ME|F')).toBeUndefined()
    expect(map.get('ME|I')).toBeUndefined()
  })
})

describe('getBaseAbbr / getDetailAbbr — cross-sheet matching', () => {
  it('strips section suffixes and qualifiers for the base', () => {
    expect(getBaseAbbr('GT-A')).toBe('GT')
    expect(getBaseAbbr('SOMA-B')).toBe('SOMA')
    expect(getBaseAbbr('FC (FIN)')).toBe('FC')
    expect(getBaseAbbr('CV (FIN-Core)')).toBe('CV')
  })
  it('strips a MULTI-char section suffix (declared-label driven, not hardcoded A–C)', () => {
    expect(getBaseAbbr('ME-Fin')).toBe('ME')
    expect(getBaseAbbr('BC-LSM')).toBe('BC')
    expect(getBaseAbbr('FA-H')).toBe('FA')   // beyond the old A–C range
  })
  it('normalises Sheet-2 lookup keys (spacing, section, alias)', () => {
    expect(getDetailAbbr('CV (FIN-Core)')).toBe('CV(FIN-CORE)')
    expect(getDetailAbbr('PF(FIN-Core)')).toBe('PF(FIN-CORE)')   // missing space
    expect(getDetailAbbr('DS-A (LSM-Core)')).toBe('DS(LSM-CORE)') // section stripped
    expect(getDetailAbbr('GT-B')).toBe('GT')
    expect(getDetailAbbr('RTM')).toBe('RM')                       // alias
    expect(getDetailAbbr('RTM-A')).toBe('RM')
  })
})

describe('classifyColor / rgbToHex — cancellation/addition detection', () => {
  it('detects saturated and pastel reds', () => {
    expect(classifyColor('#ff0000')).toBe('red')
    expect(classifyColor('#f4cccc')).toBe('red')   // Google "light red 3"
  })
  it('detects saturated and pastel greens', () => {
    expect(classifyColor('#00ff00')).toBe('green')
    expect(classifyColor('#d9ead3')).toBe('green')  // Google "light green 3"
  })
  it('treats white, grey and null as normal', () => {
    expect(classifyColor(null)).toBe('normal')
    expect(classifyColor('#ffffff')).toBe('normal')
    expect(classifyColor('#cccccc')).toBe('normal')
  })
  it('rgbToHex converts floats and maps near-white to null', () => {
    expect(rgbToHex({ red: 1, green: 0, blue: 0 })).toBe('#ff0000')
    expect(rgbToHex({ red: 1, green: 1, blue: 1 })).toBeNull()
    expect(rgbToHex(null)).toBeNull()
    expect(rgbToHex(undefined)).toBeNull()
  })
  it('round-trips a pastel red through rgbToHex → classifyColor', () => {
    const hex = rgbToHex({ red: 0.957, green: 0.8, blue: 0.8 })
    expect(classifyColor(hex)).toBe('red')
  })
})

describe('parseCourseDetails — Sheet-2 enrichment lookup', () => {
  const sheet2 = [
    ['Abbreviation', 'Course Name', 'Credits', 'Faculty'],
    ['CV (FIN-Core)', 'Corporate Valuation', '3', 'Prof. Abhilash S Nair'],
    ['PF(FIN-Core)', 'Personal Finance', '3', 'Prof. Pankaj Kumar Baag'],
    ['RM', 'Retail Management', '3', 'Prof. Someone'],
    ['', '', '', ''],
  ]
  it('keys rows so schedule codes resolve via getDetailAbbr', () => {
    const map = parseCourseDetails(sheet2)
    expect(map.get(getDetailAbbr('CV (FIN-Core)'))?.faculty).toBe('Prof. Abhilash S Nair')
    expect(map.get(getDetailAbbr('PF (FIN-Core)'))?.faculty).toBe('Prof. Pankaj Kumar Baag')
    expect(map.get(getDetailAbbr('RTM'))?.name).toBe('Retail Management') // RTM→RM alias
  })
  it('ignores blank rows', () => {
    expect(parseCourseDetails(sheet2).size).toBe(3)
  })
})

describe('venue / multi-word schedule cells', () => {
  it('cleanCode collapses an embedded newline into one line', () => {
    expect(cleanCode('YMHC\nMN Common Room')).toBe('YMHC MN Common Room')
    expect(cleanCode('GT-A')).toBe('GT-A')
    expect(cleanCode('  ST   (FIN-Core) ')).toBe('ST (FIN-Core)')
  })
  it('with NO venue alias configured, the parser keeps the cleaned schedule text as the code', () => {
    const data = buildSheet([['Tuesday, 9 June, 2026', '09.15-10.30', 'YMHC\nMN Common Room', '', '', '']])
    const parsed = parseSheetRows(data.sheet1)[0]   // default profile has no venue alias
    expect(parsed.course_code).toBe('YMHC MN Common Room')
    expect(parsed.course_name).toBe('YMHC MN Common Room')
  })
  it('normalizeScheduleCode: a venue alias (multi-word key) yields the real code + the full cell as the display name', () => {
    const aliases = { 'YMHC MN Common Room': 'YMHC' }
    expect(normalizeScheduleCode('YMHC\nMN Common Room', aliases)).toEqual({ code: 'YMHC', name: 'YMHC MN Common Room' })
    expect(normalizeScheduleCode('GT-A', aliases)).toEqual({ code: 'GT-A' })          // plain cell unchanged
    expect(normalizeScheduleCode('RTM', { RTM: 'RM' })).toEqual({ code: 'RTM' })       // single-token alias = not a venue
  })
})
