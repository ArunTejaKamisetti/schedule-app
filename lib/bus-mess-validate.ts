// Pure validators for the admin-pasted bus/mess JSON — no DB, so they're unit-tested. They accept
// the JSON a free chat tool produces and normalize it to the EXACT shapes the app already uses
// (`BusTrip` from lib/bus, `DayMenu`/`Meal` from lib/mess), rejecting anything malformed with a
// human-readable reason the admin sees before saving.

import type { BusTrip } from './bus'
import type { DayMenu, Meal } from './mess'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface BusContentInput { note?: string; stops?: string[]; trips: BusTrip[] }
export interface MessContentInput { note?: string; menu: Record<string, DayMenu> }

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function asObject(input: unknown): Result<Record<string, unknown>> {
  let v = input
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { return { ok: false, error: 'That is not valid JSON.' } }
  }
  if (!v || typeof v !== 'object') return { ok: false, error: 'Expected a JSON object.' }
  return { ok: true, value: v as Record<string, unknown> }
}

const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string')

// Best-effort "8:55 AM" → minutes since midnight, used only when a trip omits `min`. Note the
// app's convention that a post-midnight "12:00 AM" terminal trip should carry min 1440 explicitly;
// the prompt asks the chat tool to include `min`, so this is just a fallback.
export function timeToMin(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const ap = m[3]?.toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}

export function parseBusPayload(input: unknown): Result<BusContentInput> {
  const parsed = asObject(input)
  // Accept a bare array of trips too.
  const obj = parsed.ok ? parsed.value : (Array.isArray(input) ? { trips: input } : null)
  if (!obj) return parsed as Result<BusContentInput>
  const tripsRaw = Array.isArray(obj) ? obj : obj.trips
  if (!Array.isArray(tripsRaw) || tripsRaw.length === 0) {
    return { ok: false, error: 'Expected a non-empty "trips" array.' }
  }

  const trips: BusTrip[] = []
  for (let i = 0; i < tripsRaw.length; i++) {
    const t = tripsRaw[i] as Record<string, unknown>
    const where = `Trip ${i + 1}`
    if (!t || typeof t.time !== 'string' || typeof t.from !== 'string') {
      return { ok: false, error: `${where}: needs a string "time" and "from".` }
    }
    if (!isStringArray(t.to)) return { ok: false, error: `${where}: "to" must be an array of strings.` }
    const min = typeof t.min === 'number' ? t.min : timeToMin(t.time)
    if (min == null) return { ok: false, error: `${where}: "min" is missing and time "${t.time}" can't be parsed.` }
    trips.push({ time: t.time, min, from: t.from, to: t.to, maingate: t.maingate === true })
  }

  const value: BusContentInput = { trips }
  if (typeof obj.note === 'string') value.note = obj.note
  if (isStringArray(obj.stops)) value.stops = obj.stops
  return { ok: true, value }
}

function parseMeal(m: unknown): Meal | null {
  const o = m as Record<string, unknown> | null
  if (!o || !isStringArray(o.veg)) return null
  const meal: Meal = { veg: o.veg }
  if (isStringArray(o.special)) meal.special = o.special
  return meal
}

export function parseMessPayload(input: unknown): Result<MessContentInput> {
  const parsed = asObject(input)
  if (!parsed.ok) return parsed
  const obj = parsed.value
  // Accept { note, menu: {...} } or a bare { MON: {...}, ... }.
  const menuRaw = (obj.menu ?? obj) as Record<string, unknown>
  if (!menuRaw || typeof menuRaw !== 'object') {
    return { ok: false, error: 'Expected a "menu" object keyed by weekday (MON…SUN).' }
  }

  const menu: Record<string, DayMenu> = {}
  for (const day of Object.keys(menuRaw)) {
    const code = day.trim().toUpperCase().slice(0, 3)
    if (code === 'NOTE') continue
    if (!WEEKDAYS.includes(code)) return { ok: false, error: `Unknown weekday "${day}". Use MON…SUN.` }
    const dm = menuRaw[day] as Record<string, unknown>
    const breakfast = parseMeal(dm?.breakfast)
    const lunch = parseMeal(dm?.lunch)
    const dinner = parseMeal(dm?.dinner)
    if (!breakfast || !lunch || !dinner) {
      return { ok: false, error: `${code}: needs breakfast, lunch and dinner, each with a "veg" array.` }
    }
    menu[code] = { breakfast, lunch, dinner }
  }
  if (Object.keys(menu).length === 0) return { ok: false, error: 'No weekdays found in the menu.' }

  const value: MessContentInput = { menu }
  if (typeof obj.note === 'string') value.note = obj.note
  return { ok: true, value }
}
