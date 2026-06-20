import { describe, it, expect } from 'vitest'
import {
  parseYear1Roster,
  parseYear2Roster,
  looksLikeEmail,
  normalizeSection,
  splitCodes,
} from '@/lib/roster-parse'

describe('looksLikeEmail', () => {
  it('accepts a normal address, rejects junk', () => {
    expect(looksLikeEmail('a.rao@iimk.ac.in')).toBe(true)
    expect(looksLikeEmail('Section')).toBe(false)
    expect(looksLikeEmail('')).toBe(false)
    expect(looksLikeEmail('no-at-sign.com')).toBe(false)
  })
})

describe('normalizeSection', () => {
  it('strips a "Sec"/"Section" prefix and uppercases', () => {
    expect(normalizeSection('Sec A')).toBe('A')
    expect(normalizeSection('section c')).toBe('C')
    expect(normalizeSection(' b ')).toBe('B')
  })
  it('keeps specialisation labels', () => {
    expect(normalizeSection('LSM')).toBe('LSM')
    expect(normalizeSection('fin')).toBe('FIN')
  })
})

describe('splitCodes', () => {
  it('splits on comma/semicolon/slash/newline and trims, keeping spaces inside a code', () => {
    expect(splitCodes('GT-A, FC (FIN); SOMA-B / DW3.0')).toEqual(['GT-A', 'FC (FIN)', 'SOMA-B', 'DW3.0'])
    expect(splitCodes('  ')).toEqual([])
  })
})

describe('parseYear1Roster (email → section)', () => {
  it('parses a headered sheet', () => {
    const rows = [
      ['Email', 'Name', 'Section'],
      ['a.rao@iimk.ac.in', 'A Rao', 'C'],
      ['b.k@iimk.ac.in', 'B K', 'Sec H'],
    ]
    expect(parseYear1Roster(rows)).toEqual([
      { email: 'a.rao@iimk.ac.in', section: 'C' },
      { email: 'b.k@iimk.ac.in', section: 'H' },
    ])
  })

  it('works with no header row (finds the email column by content)', () => {
    const rows = [
      ['x@iimk.ac.in', 'A'],
      ['y@iimk.ac.in', 'LSM'],
    ]
    expect(parseYear1Roster(rows)).toEqual([
      { email: 'x@iimk.ac.in', section: 'A' },
      { email: 'y@iimk.ac.in', section: 'LSM' },
    ])
  })

  it('normalizes email case, skips blank/invalid rows, last duplicate wins', () => {
    const rows = [
      ['Email', 'Section'],
      ['  A.Rao@IIMK.AC.IN ', 'A'],
      ['', ''],
      ['not-an-email', 'B'],
      ['a.rao@iimk.ac.in', 'D'],
    ]
    expect(parseYear1Roster(rows)).toEqual([{ email: 'a.rao@iimk.ac.in', section: 'D' }])
  })
})

describe('parseYear2Roster (email → elective codes)', () => {
  it('parses a single comma-separated electives column', () => {
    const rows = [
      ['Email', 'Electives'],
      ['a@iimk.ac.in', 'GT-A, FC (FIN), CONSULTING'],
      ['b@iimk.ac.in', 'IAPM-B'],
    ]
    expect(parseYear2Roster(rows)).toEqual([
      { email: 'a@iimk.ac.in', codes: ['GT-A', 'FC (FIN)', 'CONSULTING'] },
      { email: 'b@iimk.ac.in', codes: ['IAPM-B'] },
    ])
  })

  it('parses several code columns, excluding a name column and the email column', () => {
    const rows = [
      ['Email', 'Name', 'Course 1', 'Course 2', 'Course 3'],
      ['a@iimk.ac.in', 'A Rao', 'GT-A', 'CV', 'RTM'],
    ]
    expect(parseYear2Roster(rows)).toEqual([{ email: 'a@iimk.ac.in', codes: ['GT-A', 'CV', 'RTM'] }])
  })

  it('dedupes repeated codes within a student and skips invalid rows', () => {
    const rows = [
      ['Email', 'Electives'],
      ['a@iimk.ac.in', 'GT-A, GT-A, CV'],
      ['header-junk', 'x'],
    ]
    expect(parseYear2Roster(rows)).toEqual([{ email: 'a@iimk.ac.in', codes: ['GT-A', 'CV'] }])
  })
})
