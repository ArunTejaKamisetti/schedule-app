import { NextRequest, NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// Identity is the signed-in user (session cookie) — never a client-supplied userId. Queries run on
// the RLS client, so the DB also enforces auth.uid() = user_id (migration 014).

// GET /api/attendance  → [{ course_id, status }] for the signed-in user
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session
  const { data, error } = await supabase.from('attendance').select('course_id, status').eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/attendance  { courseId, status: 'present'|'absent'|null }   null clears the mark.
export async function POST(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { courseId, status } = await req.json()
  if (!courseId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  if (status === null || status === undefined) {
    await supabase.from('attendance').delete().eq('user_id', userId).eq('course_id', courseId)
  } else if (status === 'present' || status === 'absent') {
    await supabase.from('attendance').upsert(
      { user_id: userId, course_id: courseId, status, marked_at: new Date().toISOString() },
      { onConflict: 'user_id,course_id' }
    )
  } else {
    return NextResponse.json({ error: 'Bad status' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
