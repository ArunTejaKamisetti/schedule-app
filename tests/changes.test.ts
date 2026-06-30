import { describe, it, expect } from 'vitest'
import { CHANGE_WINDOW_MS, CHANGE_LABEL, recentlyChanged } from '@/lib/changes'

describe('recentlyChanged — the 3-day highlight window', () => {
  const NOW = Date.parse('2026-06-15T12:00:00Z')

  it('is true within the window and false past it', () => {
    expect(recentlyChanged({ change_kind: 'added', last_changed_at: '2026-06-15T11:00:00Z' }, NOW)).toBe(true)
    const old = new Date(NOW - CHANGE_WINDOW_MS - 1000).toISOString()
    expect(recentlyChanged({ change_kind: 'added', last_changed_at: old }, NOW)).toBe(false)
  })

  it('is false without a change_kind or a timestamp (a cleared highlight)', () => {
    expect(recentlyChanged({ change_kind: null, last_changed_at: '2026-06-15T11:00:00Z' }, NOW)).toBe(false)
    expect(recentlyChanged({ change_kind: 'added', last_changed_at: null }, NOW)).toBe(false)
  })

  it('exposes a 3-day window and human labels', () => {
    expect(CHANGE_WINDOW_MS).toBe(3 * 24 * 60 * 60 * 1000)
    expect(CHANGE_LABEL.added).toBe('New')
    expect(CHANGE_LABEL.moved).toBe('Moved')
  })
})
