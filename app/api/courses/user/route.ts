import { NextRequest, NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'
import { getUserSessions } from '@/lib/enrollment'
import { syncGoogleCalendarForUser } from '@/lib/gcal'

// GET /api/courses/user  → every current session of the signed-in user's picked courses.
// Resolved by course CODE (not frozen session ids), so classes added/moved/updated in the
// sheet after the user picked show up here immediately. Shape kept as { course_id, courses }
// for existing consumers (Home, Schedule, Courses).
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session
  const sessions = await getUserSessions(supabase, userId)
  return NextResponse.json(sessions.map((c) => ({ course_id: c.id, added_at: null, courses: c })))
}

// POST /api/courses/user  → add or remove a whole course (all its dated sessions) for the
// signed-in user. Body: { courseCode, action: 'add' | 'remove' }
export async function POST(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { courseCode, action } = await req.json()
  if (!courseCode || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (action === 'add') {
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
  // The UI updates optimistically, so this runs in the background of the request.
  await syncGoogleCalendarForUser(userId, new Set([courseCode])).catch(() => {})

  return NextResponse.json({ ok: true })
}
