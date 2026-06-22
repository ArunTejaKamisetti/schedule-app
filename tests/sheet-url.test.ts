import { describe, it, expect } from 'vitest'
import { parseSheetId } from '@/lib/sheet-url'

const ID = '1AbC-dEfGh_IjKlMnOpQrStUvWxYz0123456789AbCdE'

describe('parseSheetId', () => {
  it('extracts the id from a full edit link', () => {
    expect(parseSheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toBe(ID)
  })

  it('extracts the id from a link without /edit', () => {
    expect(parseSheetId(`https://docs.google.com/spreadsheets/d/${ID}`)).toBe(ID)
  })

  it('extracts the id from a link with query params', () => {
    expect(parseSheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`)).toBe(ID)
  })

  it('accepts a bare id', () => {
    expect(parseSheetId(ID)).toBe(ID)
  })

  it('trims surrounding whitespace', () => {
    expect(parseSheetId(`  ${ID}  `)).toBe(ID)
    expect(parseSheetId(`\n https://docs.google.com/spreadsheets/d/${ID}/edit \n`)).toBe(ID)
  })

  it('returns null for empty / nullish input', () => {
    expect(parseSheetId('')).toBeNull()
    expect(parseSheetId('   ')).toBeNull()
    expect(parseSheetId(null)).toBeNull()
    expect(parseSheetId(undefined)).toBeNull()
  })

  it('returns null for a non-sheet string with spaces', () => {
    expect(parseSheetId('not a sheet link')).toBeNull()
    expect(parseSheetId('https://example.com/foo/bar')).toBeNull()
  })
})
