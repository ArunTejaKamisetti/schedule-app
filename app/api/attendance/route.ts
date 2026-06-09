import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/attendance?userId=…  → [{ course_id, status }]
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('attendance').select('course_id, status').eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/attendance  { userId, courseId, status: 'present'|'absent'|null }
// null clears the mark.
export async function POST(req: NextRequest) {
  const { userId, courseId, status } = await req.json()
  if (!userId || !courseId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const supabase = createServiceClient()

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
