// Year scoping for the schedule views. Students only ever see their own year; an admin (poweruser)
// can flip between 1st/2nd year via the header switch, so every year-aware page funnels through these
// two pure helpers (unit-tested) instead of re-deriving the rule per page.

// The year currently being viewed. Non-admins are always pinned to their own year (null ⇒ 2nd year);
// admins follow the header switch.
export function resolveViewYear(
  isAdmin: boolean,
  userYear: number | null | undefined,
  adminTab: 1 | 2,
): 1 | 2 {
  if (isAdmin) return adminTab
  return userYear === 1 ? 1 : 2
}

// Keep only the rows belonging to `year`, defaulting a missing year to 2 (the DB default). Used to
// scope the admin's all-years session/event feed down to the year they're browsing.
export function coursesForYear<T extends { year?: number | null }>(items: T[], year: 1 | 2): T[] {
  return items.filter((c) => (c.year ?? 2) === year)
}

// As a poweruser, an admin is enrolled in EVERY section (1st year) and EVERY elective (2nd year). For
// 2nd year that is already one session per elective, but for 1st year the SAME subject repeats once
// per section (A–H) at the same time, each in a DIFFERENT room — so the admin sees up to eight copies
// of every class, each claiming a different classroom. None of those rooms is "the admin's room", so:
//   • collapse the per-section duplicates to a single representative per (course_code, date, time), and
//   • drop the room (there is no single classroom for someone who is in all sections).
// Common events (exams/holidays) and every 2nd-year session pass through untouched; non-admins are
// returned as-is. Pure (no DB) so it is unit-tested and shared by Home + Schedule.
export function adminCollapseSessions<
  T extends {
    course_code: string
    session_date: string | null
    start_time: string | null
    room?: string | null
    year?: number | null
    is_common?: boolean
  }
>(items: T[], isAdmin: boolean): T[] {
  if (!isAdmin) return items
  const seen = new Set<string>()
  const out: T[] = []
  for (const c of items) {
    if (c.is_common || (c.year ?? 2) !== 1) { out.push(c); continue }
    const key = `${c.course_code}|${c.session_date}|${c.start_time}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...c, room: null })
  }
  return out
}
