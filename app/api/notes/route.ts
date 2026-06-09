import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/notes?userId=…  → [{ course_id, session_date, body }]
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('notes').select('course_id, session_date, body').eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/notes  { userId, courseId, sessionDate, body }   (empty body deletes)
export async function POST(req: NextRequest) {
  const { userId, courseId, sessionDate, body } = await req.json()
  if (!userId || !courseId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const supabase = createServiceClient()

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
