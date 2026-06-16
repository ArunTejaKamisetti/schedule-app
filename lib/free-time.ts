import { timeToMinutes } from './clashes'

// Canonical timetable periods (start times) and their ends — the single source of truth for the
// free/busy grid, shared by the weekly schedule, the Compare view, and Free Time Analysis.
export const CANONICAL_SLOTS = ['09:15', '10:45', '12:15', '14:30', '16:00', '17:30', '19:00', '20:30'] as const
export const SLOT_END: Record<string, string> = {
  '09:15': '10:30', '10:45': '12:00', '12:15': '13:30', '14:30': '15:45',
  '16:00': '17:15', '17:30': '18:45', '19:00': '20:15', '20:30': '21:45', '22:00': '23:15',
}

// Minimal shape needed to decide if something occupies time. `Course` satisfies it.
export interface FreeTimeSession {
  start_time: string | null
  end_time: string | null
  is_cancelled?: boolean | null
  event_kind?: string | null
}

// [startMin, endMin) of a canonical slot. Unknown ends default to a 75-min period.
export function slotRange(slot: string): [number, number] {
  const start = timeToMinutes(slot)
  const end = SLOT_END[slot] ? timeToMinutes(SLOT_END[slot]) : start + 75
  return [start, end]
}

// A session blocks free time only if it actually happens (not cancelled) and is a class or exam.
// Holidays / festivals (event_kind 'event' | 'common') leave everyone free.
export function blocksFreeTime(s: FreeTimeSession): boolean {
  if (s.is_cancelled) return false
  const k = s.event_kind ?? 'class'
  return k === 'class' || k === 'exam'
}

// Does any blocking session OVERLAP this canonical slot? Overlap (not exact start-match) so a
// multi-hour exam (e.g. 09:00–17:00) correctly blocks every slot it spans.
export function isBusyAt(sessions: FreeTimeSession[], slot: string): boolean {
  const [a, b] = slotRange(slot)
  for (const s of sessions) {
    if (!blocksFreeTime(s) || !s.start_time) continue
    const s1 = timeToMinutes(s.start_time)
    const e1 = s.end_time ? timeToMinutes(s.end_time) : s1
    if (s1 < b && a < e1) return true // [s1,e1) ∩ [a,b) ≠ ∅
  }
  return false
}

// The canonical slots a person is busy in, given one day's sessions.
export function busySlots(sessions: FreeTimeSession[]): Set<string> {
  const set = new Set<string>()
  for (const slot of CANONICAL_SLOTS) if (isBusyAt(sessions, slot)) set.add(slot)
  return set
}

// Canonical slots where NO ONE is busy — the intersection of everyone's free time.
export function commonFreeSlots(busySets: Set<string>[]): string[] {
  return CANONICAL_SLOTS.filter((slot) => busySets.every((set) => !set.has(slot)))
}
