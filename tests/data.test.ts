import { describe, it, expect } from 'vitest'
import { MESS } from '@/lib/mess'
import { BUS, BUS_STOPS } from '@/lib/bus'

describe('MESS data', () => {
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

  it('has all seven weekdays with three meals each', () => {
    for (const d of DAYS) {
      expect(MESS[d], d).toBeDefined()
      expect(MESS[d].breakfast.veg.length).toBeGreaterThan(0)
      expect(MESS[d].lunch.veg.length).toBeGreaterThan(0)
      expect(MESS[d].dinner.veg.length).toBeGreaterThan(0)
    }
  })

  it('has the corrected lunch non-veg specials', () => {
    expect(MESS.MON.lunch.special).toContain('Egg Curry')
    expect(MESS.TUE.lunch.special).toContain('Fish Curry')
    expect(MESS.WED.lunch.special).toContain('Egg Masala')
    expect(MESS.THU.lunch.special).toContain('Fish Curry')
    expect(MESS.FRI.lunch.special).toContain('Egg Roast')
    expect(MESS.SAT.lunch.special).toContain('Fish Curry')
    expect(MESS.SUN.lunch.special).toContain('Egg Curry')
  })

  it('does not double up Tue/Thu lunch with both fish and egg', () => {
    expect(MESS.TUE.lunch.special).not.toContain('Egg Curry')
    expect(MESS.THU.lunch.special).not.toContain('Egg Masala')
  })

  it('offers a boiled egg at every breakfast', () => {
    for (const d of DAYS) expect(MESS[d].breakfast.special).toContain('Boiled Egg')
  })
})

describe('BUS data', () => {
  it('is ordered by departure minute (non-decreasing) for "next bus"', () => {
    for (let i = 1; i < BUS.length; i++) {
      expect(BUS[i].min, `trip ${i} (${BUS[i].time})`).toBeGreaterThanOrEqual(BUS[i - 1].min)
    }
  })

  it('every trip departs from a known stop and lists at least one destination', () => {
    for (const t of BUS) {
      expect(BUS_STOPS, t.time).toContain(t.from)
      expect(t.to.length, t.time).toBeGreaterThan(0)
    }
  })

  it('min matches the displayed time (sanity on transcription)', () => {
    const parse = (s: string) => {
      const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)!
      let h = Number(m[1]) % 12
      if (/pm/i.test(m[3])) h += 12
      return h * 60 + Number(m[2])
    }
    for (const t of BUS) {
      // 12:00 AM is the post-midnight (1440) trip in this dataset.
      const expected = t.time === '12:00 AM' ? 1440 : parse(t.time)
      expect(t.min, t.time).toBe(expected)
    }
  })
})
