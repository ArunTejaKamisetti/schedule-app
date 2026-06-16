import { describe, it, expect } from 'vitest'
import { isBusyAt, busySlots, commonFreeSlots, slotRange, CANONICAL_SLOTS } from '@/lib/free-time'
import type { FreeTimeSession } from '@/lib/free-time'

const s = (start: string, end: string, over: Partial<FreeTimeSession> = {}): FreeTimeSession =>
  ({ start_time: start, end_time: end, is_cancelled: false, event_kind: 'class', ...over })

describe('isBusyAt — overlap, not exact start-match', () => {
  it('a 09:15–10:30 class makes only the 09:15 slot busy (adjacent slots stay free)', () => {
    const day = [s('09:15', '10:30')]
    expect(isBusyAt(day, '09:15')).toBe(true)
    expect(isBusyAt(day, '10:45')).toBe(false) // adjacent — no bleed
    expect(isBusyAt(day, '12:15')).toBe(false)
  })
  it('a 09:00–17:00 exam blocks every slot it spans', () => {
    const day = [s('09:00', '17:00', { event_kind: 'exam' })]
    expect(isBusyAt(day, '09:15')).toBe(true)
    expect(isBusyAt(day, '12:15')).toBe(true)
    expect(isBusyAt(day, '16:00')).toBe(true)
    expect(isBusyAt(day, '17:30')).toBe(false) // exam ended at 17:00
  })
  it('a cancelled class does not block', () => {
    expect(isBusyAt([s('09:15', '10:30', { is_cancelled: true })], '09:15')).toBe(false)
  })
  it('a holiday / festival (event_kind event|common) does not block', () => {
    expect(isBusyAt([s('09:00', '17:00', { event_kind: 'event' })], '12:15')).toBe(false)
    expect(isBusyAt([s('09:00', '17:00', { event_kind: 'common' })], '12:15')).toBe(false)
  })
})

describe('slotRange', () => {
  it('maps a canonical slot to [start,end) minutes', () => {
    expect(slotRange('09:15')).toEqual([555, 630])
    expect(slotRange('12:15')).toEqual([735, 810])
  })
})

describe('busySlots', () => {
  it('returns exactly the canonical slots a person occupies', () => {
    const day = [s('09:15', '10:30'), s('12:15', '13:30')]
    expect([...busySlots(day)].sort()).toEqual(['09:15', '12:15'])
  })
  it('is empty for a free day', () => {
    expect(busySlots([]).size).toBe(0)
  })
})

describe('commonFreeSlots — intersection of frees across people', () => {
  it('keeps only slots where nobody is busy', () => {
    const me = busySlots([s('09:15', '10:30')])              // busy 09:15
    const a = busySlots([s('12:15', '13:30')])               // busy 12:15
    const b = busySlots([s('09:15', '10:30'), s('16:00', '17:15')]) // busy 09:15, 16:00
    const free = commonFreeSlots([me, a, b])
    expect(free).not.toContain('09:15')
    expect(free).not.toContain('12:15')
    expect(free).not.toContain('16:00')
    expect(free).toContain('10:45')
    expect(free).toContain('14:30')
  })
  it('with one totally-free person returns all canonical slots', () => {
    expect(commonFreeSlots([new Set()])).toEqual([...CANONICAL_SLOTS])
  })
})
