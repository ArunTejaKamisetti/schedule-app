import { describe, it, expect } from 'vitest'
import {
  parseSheetRows, getArea, getBaseAbbr, getDetailAbbr, classifyColor, rgbToHex,
  parseCourseDetails, parseFullDate, detailKey, AREA_MAP, cleanCode, isYmhcVenue,
} from '@/lib/sheets'
import { buildSheet } from './helpers'
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
    expect(gt.sheet_tab).toBe('PGP-29 D1')
    expect(gt.day_of_week).toBe('TUE')
    expect(gt.is_common).toBe(false)
    expect(gt.event_kind).toBe('class')
  })

  it('maps each section column to its own programme label', () => {
    const data = buildSheet([
      ['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', 'IAPM-A', 'ST (FIN-Core)', 'PSM (LSM-Core)'],
    ])
    const rows = parseSheetRows(data.sheet1)
    expect(rows.find((r) => r.course_code === 'ST (FIN-Core)')!.sheet_tab).toBe('PGPFIN06 E1')
    expect(rows.find((r) => r.course_code === 'PSM (LSM-Core)')!.sheet_tab).toBe('PGPLSM06 E2')
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

describe('getArea — programme qualifiers take priority over base-abbr map', () => {
  it('routes FIN/LSM core & elective by qualifier, not base abbreviation', () => {
    expect(getArea('CV (FIN-Core)')).toBe('FIN Core')   // not FAC (CV→FAC in AREA_MAP)
    expect(getArea('DS-A (LSM-Core)')).toBe('LSM Core')
    expect(getArea('FC (FIN)')).toBe('FIN Elective')
    expect(getArea('HSCM (LSM)')).toBe('LSM Elective')
  })
  it('falls back to the area map for plain electives', () => {
    expect(getArea('GT-A')).toBe('ECO')
    expect(getArea('SBRA')).toBe('SM')
    expect(getArea('CV')).toBe('FAC')
  })
  it('returns Other for unknown codes', () => {
    expect(getArea('ZZZ-Q')).toBe('Other')
  })
})

describe('getBaseAbbr / getDetailAbbr — cross-sheet matching', () => {
  it('strips section suffixes and qualifiers for the base', () => {
    expect(getBaseAbbr('GT-A')).toBe('GT')
    expect(getBaseAbbr('SOMA-B')).toBe('SOMA')
    expect(getBaseAbbr('FC (FIN)')).toBe('FC')
    expect(getBaseAbbr('CV (FIN-Core)')).toBe('CV')
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

describe('YMHC venue special-case (one-off admin data fix)', () => {
  it('cleanCode collapses an embedded newline into one line', () => {
    expect(cleanCode('YMHC\nMN Common Room')).toBe('YMHC MN Common Room')
    expect(cleanCode('GT-A')).toBe('GT-A')
    expect(cleanCode('  ST   (FIN-Core) ')).toBe('ST (FIN-Core)')
  })
  it('isYmhcVenue detects the venue-suffixed YMHC cell only', () => {
    expect(isYmhcVenue('YMHC MN Common Room')).toBe(true)
    expect(isYmhcVenue('YMHC\nMN Common Room')).toBe(true)
    expect(isYmhcVenue('YMHC')).toBe(false)
    expect(isYmhcVenue('GT-A')).toBe(false)
  })
  it('routes the venue cell (raw or clean) to YMHC details and HLAM', () => {
    expect(getDetailAbbr('YMHC MN Common Room')).toBe('YMHC')   // enrich from Sheet-2 YMHC
    expect(getDetailAbbr('YMHC\nMN Common Room')).toBe('YMHC')  // raw newline form too
    expect(getArea('YMHC MN Common Room')).toBe('HLAM')
    expect(getArea('YMHC\nMN Common Room')).toBe('HLAM')
    expect(getArea('YMHC')).toBe('HLAM')                        // plain YMHC already HLAM
  })
  it('canonicalises a venue-override cell to its real code (so roster/enrolment match) and keeps the label', () => {
    const data = buildSheet([['Tuesday, 9 June, 2026', '09.15-10.30', 'YMHC\nMN Common Room', '', '', '']])
    const parsed = parseSheetRows(data.sheet1)[0]
    expect(parsed.course_code).toBe('YMHC')                 // canonical → matches the roster code "YMHC"
    expect(parsed.course_name).toBe('YMHC MN Common Room')  // the cell's own text kept for display
  })
})

describe('AREA_MAP sanity', () => {
  it('covers the headline electives', () => {
    expect(AREA_MAP['GT']).toBe('ECO')
    expect(AREA_MAP['SBRA']).toBe('SM')
    expect(AREA_MAP['RTM']).toBe('MM')
  })
})
