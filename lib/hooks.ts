'use client'

// Client data layer. Every page used to `fetch` the same routes on each mount (and ClassReminders
// re-fetched on every focus), so navigating Today → Schedule → Courses hammered the serverless
// functions and burned Vercel Fluid Active CPU. These SWR hooks give us one shared, deduped cache
// across all pages/components: the same key is fetched once and reused, mutations update the cache
// optimistically, and `revalidateOnFocus` is off (see SwrProvider). The shared course routes are
// additionally edge-cached (see lib/cache.ts), so even a revalidation usually never hits a function.

import useSWR, { type SWRConfiguration } from 'swr'
import { useCallback, useMemo } from 'react'
import type { Course, Friendship, User } from './types'

export const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Request failed (${r.status}): ${url}`)
  return r.json()
}

export type SessionRow = { course_id: string; courses: Course }
type AttRow = { course_id: string; status: string }
type NoteRow = { course_id: string; session_date: string | null; body: string }

export type CourseStat = {
  code: string; name: string; area: string | null; instructor: string | null
  room: string | null; credits: string | null
  total: number; held: number; present: number; absent: number; left: number; expected: number
}

// A user's picked sessions, resolved live by course code on the server. Pass a falsy userId to
// hold off fetching (SWR treats a null key as "don't fetch").
export function useUserSessions(userId?: string | null) {
  const { data, isLoading, mutate } = useSWR<SessionRow[]>(
    userId ? `/api/courses/user?userId=${userId}` : null
  )
  const courses = useMemo(() => (data ?? []).map((d) => d.courses).filter(Boolean), [data])
  const ids = useMemo(() => new Set((data ?? []).map((d) => d.course_id)), [data])
  const codes = useMemo(() => new Set(courses.map((c) => c.course_code)), [courses])
  return { rows: data, courses, ids, codes, isLoading, mutate }
}

// Common events (exams / holidays) for a year — shared across all users of that year, so this key
// is edge-cached. Pass `null` to disable (e.g. before the year is known or reminders are off).
export function useCommonEvents(year: number | null) {
  const key = year == null ? null : `/api/courses?common=1&year=${year === 1 ? 1 : 2}`
  const { data, isLoading } = useSWR<Course[]>(key)
  const events = useMemo(() => (Array.isArray(data) ? data : []), [data])
  return { events, isLoading }
}

// The 2nd-year elective catalog (one row per course). Shared → edge-cached.
export function useCatalog() {
  const { data, isLoading } = useSWR<Course[]>('/api/courses?catalog=1')
  const courses = useMemo(() => (Array.isArray(data) ? data : []), [data])
  return { courses, isLoading }
}

// Every course/session within a date window (both years' rows). Shared → edge-cached.
export function useWindowCourses(from?: string | null, to?: string | null) {
  const key = from && to ? `/api/courses?from=${from}&to=${to}` : null
  const { data, isLoading } = useSWR<Course[]>(key)
  const courses = useMemo(() => (Array.isArray(data) ? data : []), [data])
  return { courses, isLoading }
}

// Per-user attendance with an optimistic `setStatus`. Mutating the SWR cache (revalidate:false)
// keeps every open page in sync instantly without another round trip.
export function useAttendance(userId?: string | null) {
  const { data, isLoading, mutate } = useSWR<AttRow[]>(
    userId ? `/api/attendance?userId=${userId}` : null
  )
  const map = useMemo(
    () => Object.fromEntries((data ?? []).map((a) => [a.course_id, a.status])) as Record<string, string>,
    [data]
  )
  const setStatus = useCallback(
    async (courseId: string, status: 'present' | 'absent' | null) => {
      if (!userId) return
      mutate((prev) => {
        const rest = (prev ?? []).filter((a) => a.course_id !== courseId)
        return status == null ? rest : [...rest, { course_id: courseId, status }]
      }, { revalidate: false })
      await fetch('/api/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, courseId, status }),
      }).catch(() => {})
    },
    [userId, mutate]
  )
  return { map, raw: data, isLoading, setStatus, mutate }
}

// Per-user reminder notes with an optimistic `setNote` (empty body deletes).
export function useNotes(userId?: string | null) {
  const { data, isLoading, mutate } = useSWR<NoteRow[]>(
    userId ? `/api/notes?userId=${userId}` : null
  )
  const map = useMemo(
    () => Object.fromEntries((data ?? []).map((n) => [n.course_id, n.body])) as Record<string, string>,
    [data]
  )
  const setNote = useCallback(
    async (courseId: string, sessionDate: string | null, body: string) => {
      if (!userId) return
      const trimmed = body.trim()
      mutate((prev) => {
        const rest = (prev ?? []).filter((n) => n.course_id !== courseId)
        return trimmed ? [...rest, { course_id: courseId, session_date: sessionDate, body: trimmed }] : rest
      }, { revalidate: false })
      await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, courseId, sessionDate, body: trimmed }),
      }).catch(() => {})
    },
    [userId, mutate]
  )
  return { map, raw: data, isLoading, setNote, mutate }
}

// Per-user attendance stats for the "My Courses" view. `enabled` lets callers pause it (e.g. while
// editing) without violating the rules-of-hooks.
export function useAttendanceSummary(userId?: string | null, enabled = true) {
  const { data, isLoading, mutate } = useSWR<CourseStat[]>(
    userId && enabled ? `/api/attendance/summary?userId=${userId}` : null
  )
  const summary = useMemo(() => (Array.isArray(data) ? data : []), [data])
  return { summary, isLoading, mutate }
}

export type FriendRow = Friendship & { friend: User }

// A user's friendships (raw — callers filter by status / sort). Shared between the Friends list
// and Compare via the same key, so opening Compare doesn't refetch what Friends already loaded.
export function useFriends(userId?: string | null) {
  const { data, isLoading, mutate } = useSWR<FriendRow[]>(
    userId ? `/api/friends?userId=${userId}` : null
  )
  return { friends: data ?? [], isLoading, mutate }
}

// Re-exported so SwrProvider and any ad-hoc useSWR calls share the same defaults shape.
//
// Deliberately aggressive: each key is fetched once and then reused for the whole session. We do
// NOT auto-revalidate on focus, reconnect, or remount (`revalidateIfStale: false`) — those were
// firing extra requests on every tab switch and every flaky-mobile reconnect. Freshness instead
// comes from (a) optimistic `mutate` on every write, and (b) a fresh fetch on the next cold app
// load. Server-driven changes (sheet sync) also push a web notification, and the shared course
// routes are edge-cached, so the rare revalidation that does happen is cheap.
export const SWR_DEFAULTS: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 120_000,
  keepPreviousData: true,
}
