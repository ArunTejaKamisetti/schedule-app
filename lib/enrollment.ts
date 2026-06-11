import { createServiceClient } from './supabase/server'
import type { Course } from './types'

type ServiceClient = ReturnType<typeof createServiceClient>

// The distinct course CODES a user picked, derived from their per-session enrolment rows.
// Resolving by code — not by the frozen session id stored at pick time — is what lets
// sessions ADDED to the sheet afterwards still belong to the user.
export async function getUserPickedCodes(supabase: ServiceClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_courses')
    .select('courses(course_code)')
    .eq('user_id', userId)
  const codes = new Set<string>()
  for (const r of data ?? []) {
    const code = (r as { courses?: { course_code?: string } }).courses?.course_code
    if (code) codes.add(code)
  }
  return [...codes]
}

// Remembered per warm function instance: is the user_sessions RPC (migration 010) present?
// Avoids re-probing a missing function on every call before the migration is applied.
let rpcAvailable: boolean | null = null

// Every CURRENT session of the courses a user picked. Reads the live `courses` table by
// code, so classes added / moved / updated / removed in the sheet are reflected immediately.
//
// Fast path: ONE round trip via the user_sessions RPC (migration 010) — important because the
// two-query fallback doubles latency when the DB is a region away. Falls back to the two-query
// resolution if the RPC isn't applied yet.
export async function getUserSessions(supabase: ServiceClient, userId: string): Promise<Course[]> {
  if (rpcAvailable !== false) {
    const { data, error } = await supabase.rpc('user_sessions', { p_user: userId })
    if (!error) { rpcAvailable = true; return (data ?? []) as Course[] }
    rpcAvailable = false // function missing on this instance → skip the probe next time
  }

  const codes = await getUserPickedCodes(supabase, userId)
  if (codes.length === 0) return []
  const all: Course[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .in('course_code', codes)
      .range(from, from + PAGE - 1)
    if (error || !data) break
    all.push(...(data as Course[]))
    if (data.length < PAGE) break
  }
  return all
}
