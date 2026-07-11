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

  it('lists the July lunch non-veg / fish-egg specials', () => {
    expect(MESS.MON.lunch.special).toContain('Egg Curry')
    expect(MESS.TUE.lunch.special).toContain('Bengali Fish Curry')
    expect(MESS.WED.lunch.special).toContain('Egg Masala')
    expect(MESS.THU.lunch.special).toContain('Fish Curry (Nellore Chepala Pulusu)')
    expect(MESS.FRI.lunch.special).toContain('Egg Curry')
    expect(MESS.SUN.lunch.special).toContain('Kerala Fish Curry')
    // Saturday lunch carries a paneer special (green) instead of a fish/egg dish.
    expect(MESS.SAT.lunch.special).toContain('Paneer Makkan Masala')
  })

  it('lists the July dinner non-veg specials', () => {
    expect(MESS.MON.dinner.special).toContain('Chilli Chicken')
    expect(MESS.WED.dinner.special).toContain('Kadai Chicken')
    expect(MESS.THU.dinner.special).toContain('Chicken Curry')
    expect(MESS.FRI.dinner.special).toContain('Hyd Chicken Dum Biriyani')
    expect(MESS.SAT.dinner.special).toContain('Egg Kolhapuri')
    expect(MESS.SUN.dinner.special).toContain('Butter Chicken')
  })

  it('offers an egg option at every breakfast', () => {
    for (const d of DAYS) {
      const eggs = MESS[d].breakfast.special ?? []
      expect(eggs.some((s) => /egg|omelette/i.test(s)), d).toBe(true)
    }
  })

  it('carries no Extras row anywhere in the July menu', () => {
    for (const d of DAYS) {
      expect(MESS[d].breakfast.extras, d).toBeUndefined()
      expect(MESS[d].lunch.extras, d).toBeUndefined()
      expect(MESS[d].dinner.extras, d).toBeUndefined()
    }
  })

  it('has no duplicate item within any meal (React keys on menu.veg are the item text)', () => {
    for (const d of DAYS) {
      for (const meal of [MESS[d].breakfast, MESS[d].lunch, MESS[d].dinner]) {
        const all = [...meal.veg, ...(meal.special ?? []), ...(meal.extras ?? [])]
        expect(new Set(all).size, `${d} ${all.join(',')}`).toBe(all.length)
      }
    }
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
