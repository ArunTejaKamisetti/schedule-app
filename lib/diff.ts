import type { Course, CourseChange, RawSheetData } from './types'
import { parseSheetRows, type ParsedCourse } from './sheets'

type CourseKey = string

function makeKey(c: { course_code: string; sheet_tab: string; day_of_week: string; start_time: string }): CourseKey {
  return `${c.sheet_tab}::${c.course_code}::${c.day_of_week}::${c.start_time}`
}

function parsedToPartial(p: ParsedCourse): Partial<Course> {
  return {
    course_code: p.course_code,
    course_name: p.course_name,
    instructor: p.instructor || null,
    day_of_week: p.day_of_week || null,
    start_time: p.start_time || null,
    end_time: p.end_time || null,
    room: p.room || null,
    credits: p.credits || null,
    sheet_tab: p.sheet_tab,
    sheet_row_index: p.sheet_row_index,
    is_cancelled: false,
  }
}

export interface DiffResult {
  added: ParsedCourse[]
  removed: ParsedCourse[]
  changes: CourseChange[]
  upserts: ParsedCourse[]  // added + modified combined for DB upsert
}

export function diffSheetData(
  previousSnapshot: RawSheetData | null,
  newData: RawSheetData
): DiffResult {
  const newCourses1 = parseSheetRows(newData.sheet1, 'Sheet1')
  const newCourses2 = parseSheetRows(newData.sheet2, 'Sheet2')
  const newAll = [...newCourses1, ...newCourses2]

  if (!previousSnapshot) {
    return {
      added: newAll,
      removed: [],
      changes: newAll.map((c) => ({ type: 'added', new: parsedToPartial(c), course_code: c.course_code, course_name: c.course_name })),
      upserts: newAll,
    }
  }

  const oldCourses1 = parseSheetRows(previousSnapshot.sheet1, 'Sheet1')
  const oldCourses2 = parseSheetRows(previousSnapshot.sheet2, 'Sheet2')
  const oldAll = [...oldCourses1, ...oldCourses2]

  const oldMap = new Map<CourseKey, ParsedCourse>()
  for (const c of oldAll) oldMap.set(makeKey(c), c)

  const newMap = new Map<CourseKey, ParsedCourse>()
  for (const c of newAll) newMap.set(makeKey(c), c)

  const added: ParsedCourse[] = []
  const removed: ParsedCourse[] = []
  const changes: CourseChange[] = []
  const upserts: ParsedCourse[] = []

  // Find added / modified
  for (const [key, newCourse] of newMap) {
    const old = oldMap.get(key)
    if (!old) {
      added.push(newCourse)
      changes.push({ type: 'added', new: parsedToPartial(newCourse), course_code: newCourse.course_code, course_name: newCourse.course_name })
      upserts.push(newCourse)
    } else {
      const fieldChanges = detectFieldChanges(old, newCourse)
      if (fieldChanges.length > 0) {
        upserts.push(newCourse)
        for (const fc of fieldChanges) {
          changes.push({ type: fc, old: parsedToPartial(old), new: parsedToPartial(newCourse), course_code: newCourse.course_code, course_name: newCourse.course_name })
        }
      }
    }
  }

  // Find removed
  for (const [key, oldCourse] of oldMap) {
    if (!newMap.has(key)) {
      removed.push(oldCourse)
      changes.push({ type: 'removed', old: parsedToPartial(oldCourse), course_code: oldCourse.course_code, course_name: oldCourse.course_name })
    }
  }

  return { added, removed, changes, upserts }
}

function detectFieldChanges(old: ParsedCourse, next: ParsedCourse): CourseChange['type'][] {
  const types: CourseChange['type'][] = []

  // Room change — track character-level changes
  if (normalizeField(old.room) !== normalizeField(next.room)) {
    types.push('room_change')
  }

  // Time change = rescheduled
  const timeChanged =
    normalizeField(old.start_time) !== normalizeField(next.start_time) ||
    normalizeField(old.end_time) !== normalizeField(next.end_time) ||
    normalizeField(old.day_of_week) !== normalizeField(next.day_of_week)
  if (timeChanged) {
    types.push('rescheduled')
  }

  return types
}

function normalizeField(val: string | undefined | null): string {
  return (val ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}
