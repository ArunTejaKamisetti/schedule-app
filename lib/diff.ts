import type { CellFormat, Course, CourseChange, RawSheetData } from './types'
import { classifyColor, getBaseAbbr, parseSheetRows, type ParsedCourse } from './sheets'

function parsedToPartial(p: ParsedCourse): Partial<Course> {
  return {
    course_code: p.course_code,
    course_name: p.course_name,
    instructor: p.instructor || null,
    day_of_week: p.day_of_week || null,
    session_date: p.session_date || null,
    start_time: p.start_time || null,
    end_time: p.end_time || null,
    room: p.room || null,
    credits: p.credits || null,
    sheet_tab: p.sheet_tab,
    sheet_row_index: p.sheet_row_index,
    is_cancelled: p.is_cancelled ?? false,
    is_common: p.is_common,
    event_kind: p.event_kind,
  }
}

// ─── Cell colour → state (red = cancelled, green = added) ─────────────────────

// Coordinators mark cells by colour: red (or strikethrough) = cancelled, green = added/new.
// Reads the EXACT cell the parser used (row + column), so a course code that appears in several
// columns of one row can never have its colour read from the wrong (first) cell.
function cellState(format: CellFormat[][] | undefined, rowIndex: number, colIndex: number | undefined): 'red' | 'green' | 'event' | 'normal' {
  if (!format || colIndex == null || colIndex < 0) return 'normal'
  const fmt = format[rowIndex]?.[colIndex]
  if (!fmt) return 'normal'
  if (fmt.strikethrough) return 'red'
  return classifyColor(fmt.bgColor)
}

// Re-parse a snapshot's schedule grid with its source layout + formatting + merges.
function parseSnapshot(d: RawSheetData): ParsedCourse[] {
  return parseSheetRows(d.sheet1, { layout: d.layout ?? 'division', format: d.sheet1_format, merges: d.merges })
}

export interface DiffResult {
  added: ParsedCourse[]
  removed: ParsedCourse[]
  changes: CourseChange[]
  upserts: ParsedCourse[]
}

// A physical slot in the timetable: a specific date + time + division (column).
// One slot holds at most one course, so comparing slots old↔new is how we tell
// added / removed / moved / in-cell-edit apart.
function slotKey(c: { session_date: string; start_time: string; sheet_tab: string }): string {
  return `${c.session_date}::${c.start_time}::${c.sheet_tab}`
}

export function diffSheetData(previousSnapshot: RawSheetData | null, newData: RawSheetData): DiffResult {
  const newState = (c: ParsedCourse) => cellState(newData.sheet1_format, c.sheet_row_index, c.sheet_col)

  const newAll = parseSnapshot(newData)
  for (const c of newAll) {
    c.is_cancelled = newState(c) === 'red'
  }

  // First sync / no prior snapshot: everything is baseline, no change highlights.
  if (!previousSnapshot) {
    return {
      added: newAll,
      removed: [],
      changes: newAll.map((c) => ({ type: 'added', new: parsedToPartial(c), course_code: c.course_code, course_name: c.course_name })),
      upserts: newAll,
    }
  }

  const oldState = (c: ParsedCourse) => cellState(previousSnapshot.sheet1_format, c.sheet_row_index, c.sheet_col)

  const oldAll = parseSnapshot(previousSnapshot)
  for (const c of oldAll) {
    c.is_cancelled = oldState(c) === 'red'
  }

  const oldSlots = new Map(oldAll.map((c) => [slotKey(c), c]))
  const newSlots = new Map(newAll.map((c) => [slotKey(c), c]))

  const changes: CourseChange[] = []
  const added: ParsedCourse[] = []
  const removed: ParsedCourse[] = []
  const candAdd: ParsedCourse[] = []   // appeared in a slot (new or replacing different content)
  const candRemove: ParsedCourse[] = [] // vanished from a slot (or replaced)

  function tag(c: ParsedCourse, kind: string, note?: string) {
    c.change_kind = kind
    if (note) c.change_note = note
  }

  // Pass 1 — compare each slot's content old↔new.
  for (const [k, nc] of newSlots) {
    const oc = oldSlots.get(k)
    if (!oc) { candAdd.push(nc); continue }

    if (oc.course_code === nc.course_code) {
      // Same course in the same slot — a colour change is the only signal here.
      const os = oldState(oc)
      const ns = newState(nc)
      if (ns === os) { continue } // unchanged
      if (ns === 'red') {
        tag(nc, 'cancelled')
        changes.push({ type: 'cancelled', old: parsedToPartial(oc), new: parsedToPartial(nc), course_code: nc.course_code, course_name: nc.course_name })
      } else if (os === 'red') {
        tag(nc, 'added', 'Class reinstated')
        changes.push({ type: 'added', old: parsedToPartial(oc), new: parsedToPartial(nc), course_code: nc.course_code, course_name: nc.course_name })
      } else if (ns === 'green') {
        // Cell turned green → coordinator marked this class as added/new.
        tag(nc, 'added', 'Marked as added')
        changes.push({ type: 'added', new: parsedToPartial(nc), course_code: nc.course_code, course_name: nc.course_name })
      }
      // green → normal (highlight removed): no notification.
      continue
    }

    // Different content in the same slot.
    if (getBaseAbbr(oc.course_code) === getBaseAbbr(nc.course_code)) {
      // Same course, edited in place (e.g. "GT" → "GT (E1)").
      const note = `Updated: ${oc.course_code} → ${nc.course_code}`
      tag(nc, 'updated', note)
      changes.push({ type: 'schedule_update', old: parsedToPartial(oc), new: parsedToPartial(nc), course_code: nc.course_code, course_name: nc.course_name, note })
    } else {
      // A genuinely different course took this slot — treat as remove + add (move candidates).
      candRemove.push(oc)
      candAdd.push(nc)
    }
  }
  for (const [k, oc] of oldSlots) if (!newSlots.has(k)) candRemove.push(oc)

  // Pass 2 — match removals with additions of the SAME course on the SAME date → a move.
  const removeLeft = [...candRemove]
  // Pick the most sensible removal to pair with, so a course with several moving sessions on
  // one date gets accurate notes: prefer same section (a pure time change), then same time (a
  // pure room change), then any remaining session of that course that day.
  function matchRemoval(add: ParsedCourse): number {
    const same = (rm: ParsedCourse) => rm.course_code === add.course_code && rm.session_date === add.session_date
    let i = removeLeft.findIndex((rm) => same(rm) && rm.sheet_tab === add.sheet_tab && rm.start_time !== add.start_time)
    if (i < 0) i = removeLeft.findIndex((rm) => same(rm) && rm.start_time === add.start_time && rm.sheet_tab !== add.sheet_tab)
    if (i < 0) i = removeLeft.findIndex(same)
    return i
  }
  for (const add of candAdd) {
    const idx = matchRemoval(add)
    if (idx >= 0) {
      const rm = removeLeft[idx]
      removeLeft.splice(idx, 1)
      const timeChanged = rm.start_time !== add.start_time
      const roomChanged = rm.sheet_tab !== add.sheet_tab
      const fromLbl = `${rm.start_time} ${rm.room || ''}`.trim()
      const toLbl = `${add.start_time} ${add.room || ''}`.trim()
      const note = `Moved from ${fromLbl} → ${toLbl}`
      tag(add, 'moved', note)
      changes.push({
        type: timeChanged ? 'rescheduled' : 'room_change',
        old: parsedToPartial(rm),
        new: parsedToPartial(add),
        course_code: add.course_code,
        course_name: add.course_name,
        note,
      })
      // suppress unused-var lint intent
      void roomChanged
    } else {
      tag(add, 'added')
      added.push(add)
      changes.push({ type: 'added', new: parsedToPartial(add), course_code: add.course_code, course_name: add.course_name })
    }
  }

  // Unmatched removals = genuinely removed sessions.
  for (const rm of removeLeft) {
    removed.push(rm)
    changes.push({ type: 'removed', old: parsedToPartial(rm), course_code: rm.course_code, course_name: rm.course_name })
  }

  return { added, removed, changes, upserts: newAll }
}
