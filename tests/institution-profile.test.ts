import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PROFILE, classifyBySwatches, colorDistance, matchOverride, qualifierArea, matchesKeyword,
  sectionHeaderRegex, divisionCodeRegex, mergeProfile, rowsToPatch, sanitizeProfilePatch,
  type ColorRules, type InstitutionProfile,
} from '@/lib/institution-profile'
import { classifyColor, getArea, getDetailAbbr, parseSheetRows } from '@/lib/sheets'
import { diffSheetData } from '@/lib/diff'
import { buildSheet, fmtAt } from './helpers'
import type { CellFormat } from '@/lib/types'

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

// ── catalog: overrides / qualifiers / area resolution ────────────────────────────────────────────

describe('matchOverride + getArea/getDetailAbbr via profile', () => {
  it('matches a venue override by contained text (raw or cleaned)', () => {
    expect(matchOverride('YMHC MN Common Room', DEFAULT_PROFILE.overrides)?.detailAbbr).toBe('YMHC')
    expect(matchOverride('YMHC\nMN Common Room', DEFAULT_PROFILE.overrides)?.area).toBe('HLAM')
    expect(matchOverride('GT-A', DEFAULT_PROFILE.overrides)).toBeNull()
  })

  it('resolves area from a CUSTOM catalog, not the IIM-K default', () => {
    const profile: InstitutionProfile = {
      ...DEFAULT_PROFILE,
      catalog: { areaMap: { XX: 'Marketing' }, aliases: {}, qualifiers: [] },
      overrides: [],
    }
    expect(getArea('XX', profile)).toBe('Marketing')
    expect(getArea('GT', profile)).toBe('Other') // IIM-K's GT→ECO no longer applies
  })

  it('applies a custom alias for cross-sheet matching', () => {
    const profile: InstitutionProfile = {
      ...DEFAULT_PROFILE,
      catalog: { areaMap: {}, aliases: { ZZZ: 'QQ' }, qualifiers: [] },
      overrides: [],
    }
    expect(getDetailAbbr('ZZZ', profile)).toBe('QQ')
  })
})

describe('qualifierArea — ordered substring (whitespace/dash-insensitive)', () => {
  const quals = DEFAULT_PROFILE.catalog.qualifiers
  it('checks Core before plain elective', () => {
    expect(qualifierArea('CV (FIN-Core)', quals)).toBe('FIN Core')
    expect(qualifierArea('FC (FIN)', quals)).toBe('FIN Elective')
  })
  it('tolerates spacing differences and ignores non-matches', () => {
    expect(qualifierArea('PF (FIN Core)', quals)).toBe('FIN Core')
    expect(qualifierArea('FINANCE', quals)).toBeNull() // no parens → not a qualifier match
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
    const re = sectionHeaderRegex({ sectionLabels: ['A', 'B'], sectionHeaderPrefix: 'Sec', divisionCodePattern: '' })
    expect(re.test('Sec A')).toBe(true)
    expect(re.test('Sec C')).toBe(false)
    expect('Sec B'.match(re)?.[1]).toBe('B')
  })
  it('supports a different section vocabulary', () => {
    const re = sectionHeaderRegex({ sectionLabels: ['1', '2', '3'], sectionHeaderPrefix: 'Section', divisionCodePattern: '' })
    expect(re.test('Section 2')).toBe(true)
    expect(re.test('Sec A')).toBe(false)
  })
  it('falls back to the default division pattern when the configured one is invalid', () => {
    const re = divisionCodeRegex({ sectionLabels: [], sectionHeaderPrefix: '', divisionCodePattern: '([' })
    expect(re.test('D1')).toBe(true) // used the safe fallback, did not throw
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

describe('venue/edge-case override — canonicalises the code so roster/enrolment match', () => {
  it('rewrites a matching cell to its real course code, keeping the cell text as the label', () => {
    const profile: InstitutionProfile = {
      ...DEFAULT_PROFILE,
      overrides: [{ match: 'lab block', detailAbbr: 'CHEM', area: 'Sciences' }],
      catalog: { areaMap: {}, aliases: {}, qualifiers: [] }, // CHEM intentionally NOT in the area map
    }
    const rows = [
      ['DATE', 'TIME', 'PGP', 'PGP'],
      ['', '', 'D1', 'D2'],
      ['Tuesday, 9 June, 2026', '09.15-10.30', 'CHEM\nLab Block 4', 'GT-A'],
    ]
    const parsed = parseSheetRows(rows, { profile })
    const chem = parsed.find((p) => p.course_code === 'CHEM')!
    expect(chem).toBeTruthy()                       // canonicalised → would match a roster code "CHEM"
    expect(chem.course_name).toBe('CHEM Lab Block 4') // cell label kept
    // Forced area survives canonicalisation even though CHEM isn't in the (empty) area map.
    expect(getArea(chem.course_code, profile)).toBe('Sciences')
  })

  it('default YMHC override: canonical code "YMHC" still resolves to HLAM', () => {
    expect(getArea('YMHC', DEFAULT_PROFILE)).toBe('HLAM')          // via the override forced area
    expect(getArea('YMHC MN Common Room', DEFAULT_PROFILE)).toBe('HLAM') // raw text path too
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
    expect(merged.catalog.areaMap).toBe(DEFAULT_PROFILE.catalog.areaMap) // untouched concern kept
  })
  it('replaces the overrides array wholesale when provided', () => {
    const merged = mergeProfile(DEFAULT_PROFILE, { overrides: [] })
    expect(merged.overrides).toEqual([])
  })
})

describe('sanitizeProfilePatch — coerces + rejects bad input', () => {
  it('validates hex colours and tolerance, defaults the mode', () => {
    const patch = sanitizeProfilePatch({ colors: { mode: 'weird', cancelled: ['#ff0000', 'nope', 'abc123'], tolerance: 5 } })
    expect(patch.colors?.mode).toBe('auto')
    expect(patch.colors?.cancelled).toEqual(['#ff0000', '#abc123'])
    expect(patch.colors?.tolerance).toBe(DEFAULT_PROFILE.colors.tolerance) // out-of-range → default
  })
  it('drops blank catalog entries and malformed qualifiers', () => {
    const patch = sanitizeProfilePatch({
      catalog: { areaMap: { GT: 'ECO', '': 'X', BAD: '' }, aliases: {}, qualifiers: [{ contains: '(FIN)', area: 'FIN' }, { contains: '', area: 'Z' }] },
    })
    expect(patch.catalog?.areaMap).toEqual({ GT: 'ECO' })
    expect(patch.catalog?.qualifiers).toEqual([{ contains: '(FIN)', area: 'FIN' }])
  })
  it('rejects an uncompilable division regex, keeping the default', () => {
    const patch = sanitizeProfilePatch({ sections: { divisionCodePattern: '([', sectionLabels: ['a', 'b'], sectionHeaderPrefix: 'Sec' } })
    expect(patch.sections?.divisionCodePattern).toBe(DEFAULT_PROFILE.sections.divisionCodePattern)
    expect(patch.sections?.sectionLabels).toEqual(['A', 'B']) // upper-cased
  })
  it('keeps only well-formed overrides', () => {
    const patch = sanitizeProfilePatch({ overrides: [{ match: 'common room', detailAbbr: 'YMHC', area: 'HLAM' }, { match: '', detailAbbr: 'X' }] })
    expect(patch.overrides).toEqual([{ match: 'common room', detailAbbr: 'YMHC', area: 'HLAM' }])
  })
  it('ignores unknown top-level keys', () => {
    expect(sanitizeProfilePatch({ bogus: 1, colors: { mode: 'auto' } })).toEqual({ colors: { mode: 'auto', cancelled: [], added: [], event: [], tolerance: DEFAULT_PROFILE.colors.tolerance } })
  })
})
