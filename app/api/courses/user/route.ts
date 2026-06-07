import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/courses/user?userId=xxx  → list user's selected courses
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_courses')
    .select('course_id, added_at, courses(*)')
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/courses/user  → add or remove a course
export async function POST(req: NextRequest) {
  const { userId, courseId, action } = await req.json()
  if (!userId || !courseId || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (action === 'add') {
    // Ensure user exists
    const { data: user } = await supabase.from('users').select('id').eq('id', userId).single()
    if (!user) {
      // Auto-create user
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let code = ''
      for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
      await supabase.from('users').insert({ id: userId, share_code: code })
    }

    const { error } = await supabase.from('user_courses').upsert(
      { user_id: userId, course_id: courseId },
      { ignoreDuplicates: true }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'remove') {
    const { error } = await supabase
      .from('user_courses')
      .delete()
      .eq('user_id', userId)
      .eq('course_id', courseId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
