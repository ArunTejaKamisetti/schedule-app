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
  } else if (action === 'remove') {
    const { error } = await supabase.rpc('unpick_course', { p_user: userId, p_code: courseCode })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
