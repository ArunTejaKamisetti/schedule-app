import { NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'
import { getUserSessions } from '@/lib/enrollment'
import { summarizeAttendance, istNow } from '@/lib/attendance'

// Per-picked-course attendance stats + meta, for the signed-in user.
// GET /api/attendance/summary
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const [sessions, attRes] = await Promise.all([
    getUserSessions(supabase, userId),
    supabase.from('attendance').select('course_id, status').eq('user_id', userId),
  ])

  const attByCourse = new Map<string, string>()
  for (const a of attRes.data ?? []) attByCourse.set(a.course_id, a.status)

  const { todayISO, nowHM } = istNow()
  return NextResponse.json(summarizeAttendance(sessions, attByCourse, todayISO, nowHM))
}
