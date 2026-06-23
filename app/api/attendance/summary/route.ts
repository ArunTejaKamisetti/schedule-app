import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserSessions } from '@/lib/enrollment'
import { summarizeAttendance, istNow } from '@/lib/attendance'
import { cacheHeaders, SHORT_CACHE } from '@/lib/cache'

// Per-picked-course attendance stats + meta.
// GET /api/attendance/summary?userId=…
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createServiceClient()
  const [sessions, attRes] = await Promise.all([
    getUserSessions(supabase, userId),
    supabase.from('attendance').select('course_id, status').eq('user_id', userId),
  ])

  const attByCourse = new Map<string, string>()
  for (const a of attRes.data ?? []) attByCourse.set(a.course_id, a.status)

  const { todayISO, nowHM } = istNow()
  return NextResponse.json(
    summarizeAttendance(sessions, attByCourse, todayISO, nowHM),
    { headers: cacheHeaders(SHORT_CACHE) }
  )
}
