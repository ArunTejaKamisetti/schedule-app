import { describe, it, expect } from 'vitest'
import { parseBusPayload, parseMessPayload, timeToMin } from '@/lib/bus-mess-validate'

describe('timeToMin', () => {
  it('parses 12-hour times', () => {
    expect(timeToMin('8:55 AM')).toBe(535)
    expect(timeToMin('1:35 PM')).toBe(815)
    expect(timeToMin('12:00 PM')).toBe(720)
    expect(timeToMin('12:30 AM')).toBe(30)
  })
  it('returns null for junk', () => {
    expect(timeToMin('noon')).toBe(null)
  })
})

describe('parseBusPayload', () => {
  it('accepts a full object and normalizes maingate to boolean', () => {
    const r = parseBusPayload({
      note: 'w.e.f. today', stops: ['A', 'B'],
      trips: [{ time: '8:55 AM', min: 535, from: 'A', to: ['B'], maingate: 'yes' }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.note).toBe('w.e.f. today')
      expect(r.value.stops).toEqual(['A', 'B'])
      expect(r.value.trips[0]).toEqual({ time: '8:55 AM', min: 535, from: 'A', to: ['B'], maingate: false })
    }
  })

  it('accepts a bare array and derives min from time when omitted', () => {
    const r = parseBusPayload([{ time: '1:35 PM', from: 'A', to: ['B'] }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.trips[0].min).toBe(815)
  })

  it('parses a JSON string', () => {
    const r = parseBusPayload('{"trips":[{"time":"8:55 AM","min":535,"from":"A","to":["B"]}]}')
    expect(r.ok).toBe(true)
  })

  it('rejects malformed input with a reason', () => {
    expect(parseBusPayload('not json')).toEqual({ ok: false, error: 'That is not valid JSON.' })
    expect(parseBusPayload({ trips: [] }).ok).toBe(false)
    expect(parseBusPayload({ trips: [{ time: '9 AM', from: 'A', to: 'B' }] }).ok).toBe(false) // to not array
    const bad = parseBusPayload({ trips: [{ time: 'noon', from: 'A', to: ['B'] }] })
    expect(bad.ok).toBe(false) // unparseable time + no min
  })
})

describe('parseMessPayload', () => {
  const day = { breakfast: { veg: ['Idli'] }, lunch: { veg: ['Rice'], special: ['Egg'] }, dinner: { veg: ['Roti'] } }

  it('accepts { menu } keyed by weekday and keeps special items', () => {
    const r = parseMessPayload({ note: 'tentative', menu: { MON: day, tue: day } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.value.menu)).toEqual(['MON', 'TUE']) // normalized to 3-letter upper
      expect(r.value.menu.MON.lunch.special).toEqual(['Egg'])
      expect(r.value.note).toBe('tentative')
    }
  })

  it('accepts a bare weekday-keyed object', () => {
    const r = parseMessPayload({ WED: day })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.menu.WED.dinner.veg).toEqual(['Roti'])
  })

  it('rejects an unknown weekday or a meal missing veg', () => {
    expect(parseMessPayload({ menu: { FUNDAY: day } }).ok).toBe(false)
    expect(parseMessPayload({ menu: { MON: { breakfast: {}, lunch: day.lunch, dinner: day.dinner } } }).ok).toBe(false)
    expect(parseMessPayload('nope').ok).toBe(false)
  })
})
