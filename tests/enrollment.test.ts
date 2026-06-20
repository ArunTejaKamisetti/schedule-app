import { describe, it, expect } from 'vitest'
import { distinctCodes } from '@/lib/enrollment'

describe('distinctCodes (collapse enrollment rows → unique codes)', () => {
  it('reads the normalized shape ({ course_code })', () => {
    expect(distinctCodes([{ course_code: 'GT' }, { course_code: 'FC' }])).toEqual(['GT', 'FC'])
  })

  it('reads the legacy per-session shape ({ courses: { course_code } })', () => {
    expect(
      distinctCodes([{ courses: { course_code: 'GT' } }, { courses: { course_code: 'FC' } }])
    ).toEqual(['GT', 'FC'])
  })

  it('dedupes repeated codes (the whole point of the normalization)', () => {
    const rows = [{ course_code: 'GT' }, { course_code: 'GT' }, { course_code: 'FC' }, { course_code: 'GT' }]
    expect(distinctCodes(rows)).toEqual(['GT', 'FC'])
  })

  it('skips null / empty codes and tolerates null input', () => {
    expect(distinctCodes([{ course_code: null }, { course_code: '' }, { courses: null }])).toEqual([])
    expect(distinctCodes(null)).toEqual([])
    expect(distinctCodes(undefined)).toEqual([])
  })
})
