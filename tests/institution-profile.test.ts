import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PROFILE, classifyBySwatches, colorDistance, matchesKeyword,
  sectionHeaderRegex, divisionCodeRegex, mergeProfile, rowsToPatch, sanitizeProfilePatch,
  cellSectionRegex, roomHeaderRegex, parseSectionAlloc, sectionSuffixRegex,
  type ColorRules, type InstitutionProfile,
} from '@/lib/institution-profile'
import { classifyColor, getDetailAbbr, parseSheetRows, aliasToScheduleCode } from '@/lib/sheets'
import { diffSheetData } from '@/lib/diff'
import { buildSheet, fmtAt } from './helpers'
import type { CellFormat, RawSheetData } from '@/lib/types'

// ── closest-bucket colour matcher (custom mode) ──────────────────────────────────────────────────

describe('classifyBySwatches — nearest declared swatch within tolerance', () => {
  const rules: ColorRules = { mode: 'custom', cancelled: ['#ff0000'], added: ['#00ff00'], event: ['#ffc000'], tolerance: 0.2 }

  it('matches an exact declared swatch to its bucket', () => {
    expect(classifyBySwatches('#ff0000', rules)).toBe('red')
    expect(classifyBySwatches('#00ff00', rules)).toBe('green')
    expect(classifyBySwatches('#ffc000', rules)).toBe('event')
  })

  it('matches a near swatch within tolerance, and rejects a far colour as normal', () => {
    expect(classifyBySwatches('#fe0202', rules)).toBe('red')      // tiny deviation → still red
    expect(classifyBySwatches('#3366cc', rules)).toBe('normal')   // blue → matches nothing
  })

  it('honours a custom (institution-specific) convention — e.g. blue means cancelled', () => {
    const blueCancel: ColorRules = { mode: 'custom', cancelled: ['#1c4587'], added: ['#38761d'], event: ['#bf9000'], tolerance: 0.2 }
    expect(classifyBySwatches('#1c4587', blueCancel)).toBe('red')   // 'red' = the cancelled state
    expect(classifyBySwatches('#ff0000', blueCancel)).toBe('normal') // real red isn't declared here
  })

  it('tolerance widens/narrows what counts as a match', () => {
    const offRed = '#e03030' // clearly reddish, but not the exact #ff0000 swatch
    expect(classifyBySwatches(offRed, { ...rules, tolerance: 0.1 })).toBe('normal') // strict → miss
    expect(classifyBySwatches(offRed, { ...rules, tolerance: 0.25 })).toBe('red')   // forgiving → hit
  })
})

describe('colorDistance', () => {
  it('is zero for identical colours and ~1 for black↔white', () => {
    expect(colorDistance('#123456', '#123456')).toBe(0)
    expect(colorDistance('#000000', '#ffffff')).toBeGreaterThan(0.9)
  })
  it('is Infinity for an unparseable input', () => {
    expect(colorDistance('nope', '#ffffff')).toBe(Infinity)
  })
})

describe('classifyColor — auto (default) vs custom mode', () => {
  it('auto mode keeps the channel-dominance behaviour (all shades)', () => {
    expect(classifyColor('#f4cccc')).toBe('red')     // light red
    expect(classifyColor('#d9ead3')).toBe('green')   // light green
    expect(classifyColor('#ffc000')).toBe('event')
  })
  it('custom mode uses the declared swatches', () => {
    const rules: ColorRules = { mode: 'custom', cancelled: ['#ff0000'], added: [], event: [], tolerance: 0.15 }
    expect(classifyColor('#ff0000', rules)).toBe('red')
    expect(classifyColor('#00ff00', rules)).toBe('normal') // green not declared
  })
})

// ── catalog: cross-sheet alias resolution ────────────────────────────────────────────────────────

describe('getDetailAbbr via profile', () => {
  it('applies a custom alias for cross-sheet matching', () => {
    const profile: InstitutionProfile = {
      ...DEFAULT_PROFILE,
      catalog: { aliases: { ZZZ: 'QQ' } },
    }
    expect(getDetailAbbr('ZZZ', profile)).toBe('QQ')
  })
})

describe('matchesKeyword — normalised substring', () => {
  it('matches across separators', () => {
    expect(matchesKeyword('MID TERM EXAMINATION', ['mid term'])).toBe(true)
    expect(matchesKeyword('END-TERM', ['end term'])).toBe(true)
    expect(matchesKeyword('Strategy', ['exam'])).toBe(false)
  })
})

// ── sections: regexes from config ────────────────────────────────────────────────────────────────

describe('section + division regexes from profile', () => {
  it('builds a section-header regex from prefix + labels', () => {
    const re = sectionHeaderRegex({ ...DEFAULT_PROFILE.sections, sectionLabels: ['A', 'B'], sectionHeaderPrefix: 'Sec' })
    expect(re.test('Sec A')).toBe(true)
    expect(re.test('Sec C')).toBe(false)
    expect('Sec B'.match(re)?.[1]).toBe('B')
  })
  it('supports a different section vocabulary', () => {
    const re = sectionHeaderRegex({ ...DEFAULT_PROFILE.sections, sectionLabels: ['1', '2', '3'], sectionHeaderPrefix: 'Section' })
    expect(re.test('Section 2')).toBe(true)
    expect(re.test('Sec A')).toBe(false)
  })
  it('falls back to the default division pattern when the configured one is invalid', () => {
    const re = divisionCodeRegex({ ...DEFAULT_PROFILE.sections, divisionCodePattern: '([' })
    expect(re.test('D1')).toBe(true) // used the safe fallback, did not throw
  })
})

// ── section-in-cell helpers (generic over ANY label vocabulary) ──────────────────────────────────

describe('section-in-cell helpers', () => {
  const cfg = DEFAULT_PROFILE.sections

  it('cellSectionRegex splits "<course>-<section>" using declared labels, longest-first', () => {
    const re = cellSectionRegex(cfg)
    expect('ME-Fin'.match(re)?.slice(1, 3)).toEqual(['ME', 'Fin'])   // multi-char programme cohort
    expect('BC-LSM'.match(re)?.slice(1, 3)).toEqual(['BC', 'LSM'])
    expect('DA-B'.match(re)?.slice(1, 3)).toEqual(['DA', 'B'])       // single-letter
    expect('WORKSHOP-XYZ'.match(re)).toBeNull()                       // XYZ isn't a declared label
  })

  it('roomHeaderRegex matches classroom headers, not date/time', () => {
    const re = roomHeaderRegex(cfg)
    expect(re.test('CR A1')).toBe(true)
    expect(re.test('MDC C6')).toBe(true)
    expect(re.test('Date')).toBe(false)
  })

  it('roomHeaderRegex falls back safely on an uncompilable pattern', () => {
    const re = roomHeaderRegex({ ...cfg, roomHeaderPattern: '(' })
    expect(re.test('CR A1')).toBe(true) // used the safe fallback, did not throw
  })

  it('parseSectionAlloc handles All, concatenated letters, and multi-char labels', () => {
    const labels = ['A', 'B', 'C', 'FIN', 'LSM']
    expect(parseSectionAlloc('AB', labels)).toEqual(['A', 'B'])          // concatenated single letters
    expect(parseSectionAlloc('A, Fin', labels)).toEqual(['A', 'FIN'])    // separated, mixed length
    expect(parseSectionAlloc('Fin', labels)).toEqual(['FIN'])           // NOT F/I/N
    expect(parseSectionAlloc('All sections', labels)).toEqual(['A', 'B', 'C', 'FIN', 'LSM'])
  })

  it('sectionSuffixRegex strips a declared section but leaves a "-Core" qualifier intact', () => {
    const strip = (s: string) => s.replace(sectionSuffixRegex(cfg), '')
    expect(strip('GT-A')).toBe('GT')
    expect(strip('ME-Fin')).toBe('ME')
    expect(strip('DS-A(LSM-Core)')).toBe('DS(LSM-Core)')  // "-A" before "(" stripped; "-Core" kept
  })
})

// ── end-to-end: a custom profile drives parse + diff ─────────────────────────────────────────────

describe('parse + diff with a custom colour profile', () => {
  // Institution where YELLOW (#ffff00) means cancelled instead of red.
  const yellowCancel: InstitutionProfile = {
    ...DEFAULT_PROFILE,
    colors: { mode: 'custom', cancelled: ['#ffff00'], added: ['#00b0f0'], event: ['#ffc000'], tolerance: 0.2 },
  }
  const ROW = ['Tuesday, 9 June, 2026', '09.15-10.30', 'GT-A', 'IAPM-A', '', '']
  const YELLOW: CellFormat = { bgColor: '#ffff00', strikethrough: false }
  const RED: CellFormat = { bgColor: '#ff0000', strikethrough: false }

  it('treats the institution colour as cancelled and ignores red', () => {
    const prevY = buildSheet([ROW])
    const nextY = buildSheet([ROW], [fmtAt(2, YELLOW)])
    const dY = diffSheetData(prevY, nextY, yellowCancel)
    expect(dY.changes.filter((c) => c.type === 'cancelled').map((c) => c.course_code)).toEqual(['GT-A'])

    // A red cell means nothing under this profile (not a declared swatch).
    const nextR = buildSheet([ROW], [fmtAt(2, RED)])
    const dR = diffSheetData(prevY, nextR, yellowCancel)
    expect(dR.changes.some((c) => c.type === 'cancelled')).toBe(false)
  })

  it('the default profile still reads red as cancelled (unchanged behaviour)', () => {
    const prev = buildSheet([ROW])
    const next = buildSheet([ROW], [fmtAt(2, RED)])
    const d = diffSheetData(prev, next) // no profile → DEFAULT_PROFILE
    expect(d.changes.filter((c) => c.type === 'cancelled').map((c) => c.course_code)).toEqual(['GT-A'])
  })
})

describe('diff — section-in-cell room reassignment', () => {
  const cellSheet = (body: string[][]): RawSheetData => ({
    sheet1: [['Date', 'Time', 'CR A1', 'CR A2'], ...body],
    sheet2: [], layout: 'section', fetched_at: '2026-06-29T00:00:00Z',
  })

  it('reports a room change (not a phantom add/remove) when a class swaps rooms at the same time', () => {
    // ME-Fin: CR A1 → CR A2, DA-B: CR A2 → CR A1 — same date/time/section, different classroom.
    const prev = cellSheet([['Monday, June 29, 2026', '09.15-10.30', 'ME-Fin', 'DA-B']])
    const next = cellSheet([['Monday, June 29, 2026', '09.15-10.30', 'DA-B', 'ME-Fin']])
    const d = diffSheetData(prev, next)
    expect(d.changes.filter((c) => c.type === 'room_change').map((c) => c.course_code).sort()).toEqual(['DA', 'ME'])
    expect(d.changes.some((c) => c.type === 'added' || c.type === 'removed')).toBe(false)
  })

  it('an unchanged re-sync of a section-in-cell sheet reports nothing', () => {
    const sheet = cellSheet([['Monday, June 29, 2026', '09.15-10.30', 'ME-Fin', 'DA-B']])
    const d = diffSheetData(sheet, sheet)
    expect(d.changes).toHaveLength(0)
  })
})

describe('aliasToScheduleCode — maps a roster code onto the schedule code (no schedule change)', () => {
  it('maps the alias target back to the schedule code, keeping the suffix', () => {
    expect(aliasToScheduleCode('RM')).toBe('RTM')
    expect(aliasToScheduleCode('RM-A')).toBe('RTM-A')
  })
  it('leaves a roster that already wrote the schedule code, and unaliased codes, unchanged', () => {
    expect(aliasToScheduleCode('RTM')).toBe('RTM')   // already schedule-side
    expect(aliasToScheduleCode('GT-A')).toBe('GT-A') // no alias
  })
  it('uses a custom alias map when given one', () => {
    expect(aliasToScheduleCode('QQ-B', { ZZZ: 'QQ' })).toBe('ZZZ-B')
  })
})

describe('schedule keeps its own code; roster maps onto it', () => {
  it('a schedule "RTM" cell is stored/shown as "RTM" (not the roster "RM")', () => {
    const rows = [
      ['DATE', 'TIME', 'PGP', 'PGP'],
      ['', '', 'D1', 'D2'],
      ['Tuesday, 9 June, 2026', '09.15-10.30', 'RTM', 'GT-A'],
    ]
    const parsed = parseSheetRows(rows)
    const rtm = parsed.find((p) => p.course_code === 'RTM')!
    expect(rtm).toBeTruthy()                 // schedule code preserved
    expect(rtm.course_name).toBe('RTM')      // displayed as the schedule wrote it
    // A roster "RM" maps onto "RTM", so it matches this session.
    expect(aliasToScheduleCode('RM')).toBe('RTM')
  })
})

describe('multi-word venue cell via a whole-cell alias (normalised at parse time)', () => {
  // Admin maps the messy schedule cell to the real course code: "YMHC MN Common Room" → "YMHC".
  const profile: InstitutionProfile = {
    ...DEFAULT_PROFILE,
    catalog: { ...DEFAULT_PROFILE.catalog, aliases: { ...DEFAULT_PROFILE.catalog.aliases, 'YMHC MN Common Room': 'YMHC' } },
  }

  it('the parser stores the REAL code "YMHC" but DISPLAYS the full cell as the name', () => {
    const rows = [
      ['DATE', 'TIME', 'PGP', 'PGP'],
      ['', '', 'D1', 'D2'],
      ['Tuesday, 9 June, 2026', '09.15-10.30', 'YMHC\nMN Common Room', 'GT-A'],
    ]
    const parsed = parseSheetRows(rows, { profile })
    const ymhc = parsed.find((p) => p.course_code === 'YMHC')!
    expect(ymhc).toBeTruthy()                                     // normalised to the real code
    expect(ymhc.course_name).toBe('YMHC MN Common Room')          // full cell text → the display name
    expect(ymhc.room).toBe('D1')                                  // the column's own room — never rewritten
    expect(getDetailAbbr(ymhc.course_code, profile)).toBe('YMHC') // details lookup is now trivial
  })

  it('a roster "YMHC" needs no remap — it already equals the stored code (timing-independent)', () => {
    expect(aliasToScheduleCode('YMHC', profile.catalog.aliases)).toBe('YMHC')
  })
})

describe('parseSheetRows with custom section labels', () => {
  it('parses a "Section 1/2" sheet using a configured vocabulary', () => {
    const profile: InstitutionProfile = {
      ...DEFAULT_PROFILE,
      sections: { ...DEFAULT_PROFILE.sections, sectionLabels: ['1', '2'], sectionHeaderPrefix: 'Section' },
    }
    const rows = [
      ['', '', 'Room 1', 'Room 2'],
      ['', '', 'Section 1', 'Section 2'],
      ['Tuesday, 9 June, 2026', '09.15-10.30', 'MKT', 'FIN'],
    ]
    const parsed = parseSheetRows(rows, { layout: 'section', profile })
    expect(parsed.map((p) => [p.course_code, p.sheet_tab, p.room])).toEqual([
      ['MKT', '1', 'Room 1'],
      ['FIN', '2', 'Room 2'],
    ])
  })
})

// ── merge / sanitize ─────────────────────────────────────────────────────────────────────────────

describe('mergeProfile + rowsToPatch', () => {
  it('merges saved concern rows over the defaults (field-merge for objects)', () => {
    const rows = [{ key: 'colors', data: { mode: 'custom', cancelled: ['#abcdef'], added: [], event: [], tolerance: 0.3 } }]
    const merged = mergeProfile(DEFAULT_PROFILE, rowsToPatch(rows))
    expect(merged.colors.mode).toBe('custom')
    expect(merged.colors.cancelled).toEqual(['#abcdef'])
    expect(merged.catalog.aliases).toEqual(DEFAULT_PROFILE.catalog.aliases) // untouched concern kept
  })
  it('replaces a saved catalog concern, keeping other concerns at their defaults', () => {
    const merged = mergeProfile(DEFAULT_PROFILE, { catalog: { aliases: { A: 'B' } } })
    expect(merged.catalog.aliases).toEqual({ A: 'B' })
    expect(merged.colors).toEqual(DEFAULT_PROFILE.colors)
  })
})

describe('sanitizeProfilePatch — coerces + rejects bad input', () => {
  it('validates hex colours and tolerance, defaults the mode', () => {
    const patch = sanitizeProfilePatch({ colors: { mode: 'weird', cancelled: ['#ff0000', 'nope', 'abc123'], tolerance: 5 } })
    expect(patch.colors?.mode).toBe('auto')
    expect(patch.colors?.cancelled).toEqual(['#ff0000', '#abc123'])
    expect(patch.colors?.tolerance).toBe(DEFAULT_PROFILE.colors.tolerance) // out-of-range → default
  })
  it('drops blank alias entries', () => {
    const patch = sanitizeProfilePatch({ catalog: { aliases: { RTM: 'RM', '': 'X', BAD: '' } } })
    expect(patch.catalog?.aliases).toEqual({ RTM: 'RM' })
  })
  it('rejects an uncompilable division regex, keeping the default', () => {
    const patch = sanitizeProfilePatch({ sections: { divisionCodePattern: '([', sectionLabels: ['a', 'b'], sectionHeaderPrefix: 'Sec' } })
    expect(patch.sections?.divisionCodePattern).toBe(DEFAULT_PROFILE.sections.divisionCodePattern)
    expect(patch.sections?.sectionLabels).toEqual(['A', 'B']) // upper-cased
  })
  it('keeps a whole-cell alias (e.g. a venue) in the alias map', () => {
    const patch = sanitizeProfilePatch({ catalog: { aliases: { 'YMHC MN Common Room': 'YMHC', '': 'X' } } })
    expect(patch.catalog?.aliases).toEqual({ 'YMHC MN Common Room': 'YMHC' })
  })
  it('ignores unknown top-level keys', () => {
    expect(sanitizeProfilePatch({ bogus: 1, colors: { mode: 'auto' } })).toEqual({ colors: { mode: 'auto', cancelled: [], added: [], event: [], tolerance: DEFAULT_PROFILE.colors.tolerance } })
  })

  it('sanitizes the section-in-cell rules (source, separator, room pattern)', () => {
    const patch = sanitizeProfilePatch({ sections: {
      sectionLabels: ['a', 'fin'], sectionHeaderPrefix: 'Sec', divisionCodePattern: '^[A-Z]\\d+$',
      sectionSource: 'cell', cellSectionSeparator: ' / ', roomHeaderPattern: '^LT\\b',
    } })
    expect(patch.sections?.sectionSource).toBe('cell')
    expect(patch.sections?.cellSectionSeparator).toBe('/')          // trimmed
    expect(patch.sections?.roomHeaderPattern).toBe('^LT\\b')
    expect(patch.sections?.sectionLabels).toEqual(['A', 'FIN'])     // upper-cased, multi-char kept
  })
  it('rejects a bad room pattern and an unknown source, keeping safe values', () => {
    const patch = sanitizeProfilePatch({ sections: { sectionSource: 'bogus', roomHeaderPattern: '(' } })
    expect(patch.sections?.sectionSource).toBe('auto')
    expect(patch.sections?.roomHeaderPattern).toBe(DEFAULT_PROFILE.sections.roomHeaderPattern)
    expect(patch.sections?.cellSectionSeparator).toBe(DEFAULT_PROFILE.sections.cellSectionSeparator)
  })
  it('an old saved sections row (no new fields) merges to the new defaults', () => {
    const merged = mergeProfile(DEFAULT_PROFILE, { sections: { sectionLabels: ['A', 'B'] } })
    expect(merged.sections.sectionLabels).toEqual(['A', 'B'])
    expect(merged.sections.sectionSource).toBe('auto')
    expect(merged.sections.cellSectionSeparator).toBe('-')
    expect(merged.sections.roomHeaderPattern).toBe(DEFAULT_PROFILE.sections.roomHeaderPattern)
  })
})
