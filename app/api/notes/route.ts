import { NextRequest, NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// Identity is the signed-in user (session cookie); RLS enforces auth.uid() = user_id.

// GET /api/notes  → [{ course_id, session_date, body }] for the signed-in user
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session
  const { data, error } = await supabase.from('notes').select('course_id, session_date, body').eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/notes  { courseId, sessionDate, body }   (empty body deletes)
export async function POST(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { courseId, sessionDate, body } = await req.json()
  if (!courseId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  if (!body || !String(body).trim()) {
    await supabase.from('notes').delete().eq('user_id', userId).eq('course_id', courseId)
    return NextResponse.json({ ok: true, deleted: true })
  }
  await supabase.from('notes').upsert(
    { user_id: userId, course_id: courseId, session_date: sessionDate ?? null, body: String(body).trim().slice(0, 500), created_at: new Date().toISOString() },
    { onConflict: 'user_id,course_id' }
  )
  return NextResponse.json({ ok: true })
}
