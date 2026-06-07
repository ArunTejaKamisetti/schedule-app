import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/notifications?userId=xxx
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*, course:course_id(course_code, course_name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/notifications  → mark as read
export async function PATCH(req: NextRequest) {
  const { userId, notificationId, markAll } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createServiceClient()

  if (markAll) {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId)
  } else if (notificationId) {
    await supabase.from('notifications').update({ read: true }).eq('id', notificationId).eq('user_id', userId)
  }

  return NextResponse.json({ ok: true })
}
