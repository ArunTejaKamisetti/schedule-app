import type { Course } from './types'

export function toMinutes(hhmm: string | null): number {
  if (!hhmm) return -1
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Sessions starting within the next `leadMin` minutes (and not already started), given the
// current IST time in minutes-since-midnight. Cancelled sessions are skipped. Used by the
// class-reminder cron; idempotent delivery is handled by the notification dedup key, so this
// can safely return a session for several ticks while it's inside the window.
export function selectUpcoming(sessions: Course[], nowMin: number, leadMin: number): Course[] {
  return sessions.filter((s) => {
    if (s.is_cancelled) return false
    const start = toMinutes(s.start_time)
    return start > nowMin && start - nowMin <= leadMin
  })
}

export function reminderText(course: Course, minsUntil: number): { title: string; body: string } {
  const where = course.room ? ` · Class ${course.room}` : ''
  return {
    title: `⏰ ${course.course_code} in ${minsUntil} min`,
    body: `${course.course_name} · ${course.start_time}${where}`,
  }
}

// Stable per-occurrence key so a class is reminded at most once per user (the date pins the
// occurrence; no day bucket needed).
export function reminderDedupKey(course: Course): string {
  return `class-reminder::${course.session_date}::${course.start_time}::${course.course_code}`
}
