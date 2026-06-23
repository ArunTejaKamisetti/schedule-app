import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserSessions } from '@/lib/enrollment'
import { cacheHeaders, SHORT_CACHE } from '@/lib/cache'
// NOTE: `@/lib/gcal` (which pulls in the very large `googleapis` package) is intentionally NOT
// imported at the top. This is the most-invoked route, and a top-level import would load googleapis
// on every cold start — even for GET, which never touches Google Calendar. It's lazy-imported
// inside POST instead, so GET cold starts stay light.

// GET /api/courses/user?userId=xxx  → every current session of the user's picked courses.
// Resolved by course CODE (not frozen session ids), so classes added/moved/updated in the
// sheet after the user picked show up here immediately. Shape kept as { course_id, courses }
// for existing consumers (Home, Schedule, Courses). Edge-cached per user with a short TTL.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createServiceClient()
  const sessions = await getUserSessions(supabase, userId)
  return NextResponse.json(
    sessions.map((c) => ({ course_id: c.id, added_at: null, courses: c })),
    { headers: cacheHeaders(SHORT_CACHE) }
  )
}

// POST /api/courses/user  → add or remove a whole course (all its dated sessions)
// Body: { userId, courseCode, action: 'add' | 'remove' }
export async function POST(req: NextRequest) {
  const { userId, courseCode, action } = await req.json()
  if (!userId || !courseCode || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (action === 'add') {
    // Ensure user exists
    const { data: user } = await supabase.from('users').select('id').eq('id', userId).single()
    if (!user) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let code = ''
      for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
      await supabase.from('users').insert({ id: userId, share_code: code })
    }
    const { error } = await supabase.rpc('pick_course', { p_user: userId, p_code: courseCode })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Picking an elective marks this account as 2nd-year (flips a former 1st-year section back).
    await supabase.from('users').update({ year: 2 }).eq('id', userId)
  } else if (action === 'remove') {
    const { error } = await supabase.rpc('unpick_course', { p_user: userId, p_code: courseCode })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Keep the user's Google Calendar in step with just this course (insert its events on add,
  // remove them on unpick). No-op and instant for users who haven't connected a calendar.
  // The UI updates optimistically, so this runs in the background of the request. Lazy-imported
  // so the heavy googleapis dependency only loads on this write path, never on GET.
  const { syncGoogleCalendarForUser } = await import('@/lib/gcal')
  await syncGoogleCalendarForUser(userId, new Set([courseCode])).catch(() => {})

  return NextResponse.json({ ok: true })
}
