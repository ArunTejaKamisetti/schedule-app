import { describe, it, expect } from 'vitest'
import {
  DEFAULT_RETENTION_DAYS,
  retentionDays,
  retentionCutoffDate,
  retentionCutoffIso,
} from '@/lib/retention'

describe('retentionDays (env window resolution)', () => {
  it('parses a positive integer string', () => {
    expect(retentionDays('90')).toBe(90)
  })

  it('floors a fractional value', () => {
    expect(retentionDays('90.7')).toBe(90)
  })

  it('falls back to the default for missing / zero / negative / garbage', () => {
    expect(retentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS)
    expect(retentionDays(null)).toBe(DEFAULT_RETENTION_DAYS)
    expect(retentionDays('')).toBe(DEFAULT_RETENTION_DAYS)
    expect(retentionDays('0')).toBe(DEFAULT_RETENTION_DAYS)
    expect(retentionDays('-5')).toBe(DEFAULT_RETENTION_DAYS)
    expect(retentionDays('abc')).toBe(DEFAULT_RETENTION_DAYS)
  })
})

describe('retentionCutoffDate (UTC, string-built — no TZ shift)', () => {
  it('subtracts whole days and formats YYYY-MM-DD', () => {
    expect(retentionCutoffDate(new Date('2026-06-20T10:00:00Z'), 180)).toBe('2025-12-22')
  })

  it('handles a month/year boundary', () => {
    expect(retentionCutoffDate(new Date('2026-01-05T00:00:00Z'), 10)).toBe('2025-12-26')
  })

  it('zero days is today', () => {
    expect(retentionCutoffDate(new Date('2026-06-20T23:59:59Z'), 0)).toBe('2026-06-20')
  })
})

describe('retentionCutoffIso (timestamptz cutoff = start of cutoff day UTC)', () => {
  it('appends the UTC midnight time', () => {
    expect(retentionCutoffIso(new Date('2026-06-20T10:00:00Z'), 180)).toBe('2025-12-22T00:00:00.000Z')
  })
})
