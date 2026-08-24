import { describe, it, expect } from 'vitest'
import { MESS } from '@/lib/mess'
import { STUDENT_BUS, STAFF_BUS, ALL_BUS, BUS_STOPS, STAFF_BUS_STOPS, BUS_FLEETS, busOrigins } from '@/lib/bus'

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

  it('lists the August lunch fish/egg specials (red row)', () => {
    expect(MESS.MON.lunch.special).toContain('Bengali Fish Curry')
    expect(MESS.TUE.lunch.special).toContain('Egg Pepper Roast')
    expect(MESS.WED.lunch.special).toContain('Fish Curry (Nellore Chepala Pulusu)')
    expect(MESS.THU.lunch.special).toContain('Egg Tikka Masala')
    expect(MESS.FRI.lunch.special).toContain('Kerala Fish Curry')
    expect(MESS.SUN.lunch.special).toContain('Egg Burji')
    // Saturday has no fish/egg dish — its only highlight is the green paneer gravy.
    expect(MESS.SAT.lunch.special).toEqual(['Paneer Makkan Masala'])
  })

  it('lists the August lunch SPL VEG specials (green row)', () => {
    expect(MESS.MON.lunch.special).toContain('Golden Gobi Corn Dry')
    expect(MESS.TUE.lunch.special).toContain('Rajma Masala')
    expect(MESS.WED.lunch.special).toContain('Gatte Ki Sabji')
    expect(MESS.THU.lunch.special).toContain('Peanut-Green Gram Curry')
    expect(MESS.FRI.lunch.special).toContain('Soya Chunk Curry')
    expect(MESS.SUN.lunch.special).toContain('Masala Peanut (fry)')
  })

  it('lists the August dinner non-veg specials', () => {
    expect(MESS.MON.dinner.special).toContain('Chicken Manchurian / Chicken Jalfrezi')
    expect(MESS.WED.dinner.special).toContain('Chicken Masala')
    expect(MESS.THU.dinner.special).toContain('Chicken Kolapuri')
    expect(MESS.FRI.dinner.special).toContain('Hyd Chicken Dum Biriyani')
    expect(MESS.SAT.dinner.special).toContain('Egg Kolhapuri')
    expect(MESS.SUN.dinner.special).toContain('Butter Chicken')
    // Tuesday dinner is a Combo Menu day with no separate veg/non-veg line.
    expect(MESS.TUE.dinner.special).toBeUndefined()
  })

  it('pairs a green veg special with each dinner non-veg special', () => {
    expect(MESS.MON.dinner.special).toContain('Paneer Manchurian / Paneer Jalfrezi')
    expect(MESS.WED.dinner.special).toContain('Paneer Masala')
    expect(MESS.THU.dinner.special).toContain('Shahi Paneer')
    expect(MESS.FRI.dinner.special).toContain('Hyd Paneer Dum Biriyani')
    expect(MESS.SAT.dinner.special).toContain('Soya')
    expect(MESS.SUN.dinner.special).toContain('Paneer Butter Masala')
  })

  it('offers an egg option at every breakfast', () => {
    for (const d of DAYS) {
      const eggs = MESS[d].breakfast.special ?? []
      expect(eggs.some((s) => /egg|omelette/i.test(s)), d).toBe(true)
    }
  })

  it('carries no Extras row anywhere in the August menu', () => {
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

const FLEETS = [
  ['student', STUDENT_BUS, BUS_STOPS],
  ['staff', STAFF_BUS, STAFF_BUS_STOPS],
] as const

describe.each(FLEETS)('%s BUS data', (kind, trips, stops) => {
  it('is ordered by departure minute (non-decreasing) for "next bus"', () => {
    for (let i = 1; i < trips.length; i++) {
      expect(trips[i].min, `trip ${i} (${trips[i].time})`).toBeGreaterThanOrEqual(trips[i - 1].min)
    }
  })

  it('every trip departs from a known stop and lists at least one destination', () => {
    for (const t of trips) {
      expect(stops, t.time).toContain(t.from)
      expect(t.to.length, t.time).toBeGreaterThan(0)
    }
  })

  it('is tagged with its own fleet', () => {
    for (const t of trips) expect(t.kind, t.time).toBe(kind)
  })

  it('min matches the displayed time (sanity on transcription)', () => {
    const parse = (s: string) => {
      const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)!
      let h = Number(m[1]) % 12
      if (/pm/i.test(m[3])) h += 12
      return h * 60 + Number(m[2])
    }
    for (const t of trips) {
      // 12:00 AM is the post-midnight (1440) trip in this dataset.
      const expected = t.time === '12:00 AM' ? 1440 : parse(t.time)
      expect(t.min, t.time).toBe(expected)
    }
  })
})

describe('staff BUS transcription', () => {
  it('has all 21 shuttle trips from the notice', () => {
    expect(STAFF_BUS).toHaveLength(21)
  })

  it('runs the first and last trips of the day as printed', () => {
    expect(STAFF_BUS[0]).toMatchObject({ time: '7:45 AM', from: 'Main Gate' })
    expect(STAFF_BUS[STAFF_BUS.length - 1]).toMatchObject({ time: '9:55 PM', from: 'Main Office' })
  })

  it('never claims the student-only main gate continuation', () => {
    for (const t of STAFF_BUS) expect(t.maingate, t.time).toBe(false)
  })
})

describe('ALL_BUS (merged fleets)', () => {
  it('holds every trip from both fleets and nothing else', () => {
    expect(ALL_BUS).toHaveLength(STUDENT_BUS.length + STAFF_BUS.length)
    for (const t of [...STUDENT_BUS, ...STAFF_BUS]) expect(ALL_BUS).toContain(t)
  })

  it('is ordered by departure minute, student first at an equal minute', () => {
    for (let i = 1; i < ALL_BUS.length; i++) {
      const [prev, cur] = [ALL_BUS[i - 1], ALL_BUS[i]]
      expect(cur.min, `trip ${i} (${cur.time})`).toBeGreaterThanOrEqual(prev.min)
      if (cur.min === prev.min && cur.kind !== prev.kind) expect(prev.kind).toBe('student')
    }
  })
})

describe('BUS_FLEETS', () => {
  it('exposes a labelled, noted list of trips per tab', () => {
    expect(BUS_FLEETS.all.trips).toBe(ALL_BUS)
    expect(BUS_FLEETS.student.trips).toBe(STUDENT_BUS)
    expect(BUS_FLEETS.staff.trips).toBe(STAFF_BUS)
    for (const f of ['all', 'student', 'staff'] as const) {
      expect(BUS_FLEETS[f].label, f).toBeTruthy()
      expect(BUS_FLEETS[f].note, f).toBeTruthy()
    }
  })

  it('offers only "from" chips that actually have trips', () => {
    for (const f of ['all', 'student', 'staff'] as const) {
      const origins = busOrigins(BUS_FLEETS[f].trips)
      expect(new Set(origins).size, f).toBe(origins.length)
      for (const o of origins) {
        expect(BUS_FLEETS[f].trips.some((t) => t.from === o), `${f} → ${o}`).toBe(true)
      }
    }
  })
})
