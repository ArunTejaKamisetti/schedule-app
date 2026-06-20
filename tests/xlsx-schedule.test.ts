import { describe, it, expect } from 'vitest'
import { argbToHex, colToNum, parseMergeRange } from '@/lib/xlsx-schedule'

describe('argbToHex (exceljs fill → hex, white = null)', () => {
  it('drops the alpha from ARGB', () => {
    expect(argbToHex('FFFF0000')).toBe('#ff0000')
    expect(argbToHex('FF00FF00')).toBe('#00ff00')
  })
  it('accepts plain RRGGBB', () => {
    expect(argbToHex('0000FF')).toBe('#0000ff')
  })
  it('treats near-white as no fill (null)', () => {
    expect(argbToHex('FFFFFFFF')).toBeNull()
    expect(argbToHex('FFFEFEFE')).toBeNull()
  })
  it('returns null for missing / unparseable values', () => {
    expect(argbToHex(undefined)).toBeNull()
    expect(argbToHex(null)).toBeNull()
    expect(argbToHex('theme1')).toBeNull()
    expect(argbToHex('FF0')).toBeNull()
  })
})

describe('colToNum (column letters → 1-based)', () => {
  it('maps single and multi-letter columns', () => {
    expect(colToNum('A')).toBe(1)
    expect(colToNum('Z')).toBe(26)
    expect(colToNum('AA')).toBe(27)
    expect(colToNum('AB')).toBe(28)
  })
})

describe('parseMergeRange (A1:B3 → 0-based, end-exclusive box)', () => {
  it('converts a range to the diff-aligned shape', () => {
    expect(parseMergeRange('A1:B3')).toEqual({ startRow: 0, endRow: 3, startCol: 0, endCol: 2 })
  })
  it('normalises reversed ranges', () => {
    expect(parseMergeRange('B3:A1')).toEqual({ startRow: 0, endRow: 3, startCol: 0, endCol: 2 })
  })
  it('handles a single-cell merge', () => {
    expect(parseMergeRange('C5:C5')).toEqual({ startRow: 4, endRow: 5, startCol: 2, endCol: 3 })
  })
  it('returns null for malformed ranges', () => {
    expect(parseMergeRange('nonsense')).toBeNull()
    expect(parseMergeRange('A1')).toBeNull()
  })
})
