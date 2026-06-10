import type { Course } from './types'

export interface CourseAttendanceStat {
  code: string; name: string; area: string | null; instructor: string | null
  room: string | null; credits: string | null
  total: number; held: number; present: number; absent: number; left: number; expected: number
}

// A session counts as "held" only once it has actually STARTED — date AND start time in IST,
// not merely because its date is today. (Fixes the bug where a class later today was already
// counted as held at 00:00.)
export function isSessionHeld(
  sessionDate: string | null,
  startTime: string | null,
  todayISO: string,
  nowHM: string
): boolean {
  const d = sessionDate ?? ''
  if (!d) return false
  return d < todayISO || (d === todayISO && (startTime ?? '23:59') <= nowHM)
}

// Per-course attendance roll-up. Cancelled sessions don't count toward total/held/left;
// common events (exams) are excluded. `expected` = credits × 8 (sheet count is the truth,
// expected is shown only as a mismatch hint).
export function summarizeAttendance(
  sessions: Course[],
  attByCourse: Map<string, string>,
  todayISO: string,
  nowHM: string
): CourseAttendanceStat[] {
  const map = new Map<string, CourseAttendanceStat>()
  for (const s of sessions) {
    if (s.is_common) continue
    let st = map.get(s.course_code)
    if (!st) {
      const cr = parseInt(s.credits ?? '') || 0
      st = {
        code: s.course_code, name: s.course_name, area: s.area, instructor: s.instructor,
        room: s.room, credits: s.credits,
        total: 0, held: 0, present: 0, absent: 0, left: 0, expected: cr * 8,
      }
      map.set(s.course_code, st)
    }
    if (s.is_cancelled) continue
    st.total++
    if (isSessionHeld(s.session_date, s.start_time, todayISO, nowHM)) st.held++
    else st.left++
    const status = attByCourse.get(s.id)
    if (status === 'present') st.present++
    else if (status === 'absent') st.absent++
  }
  return [...map.values()]
}

// "now" in IST as { todayISO, nowHM } — the sheet's timezone.
export function istNow(now: number = Date.now()): { todayISO: string; nowHM: string } {
  const ist = new Date(now + 5.5 * 60 * 60 * 1000)
  const todayISO = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`
  const nowHM = `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
  return { todayISO, nowHM }
}
