import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/notifications?userId=xxx  — NOT cached. Alerts are per-user MUTABLE data: the user reads,
// deletes and clears them, and the badge re-fetches immediately after each mutation. A shared edge
// cache here would serve the stale pre-mutation list back, so a "Read all" / "Clear" appears to do
// nothing (the count returns and dismissed alerts reappear on reopen). Keep it uncached.
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
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
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

// DELETE /api/notifications?userId=xxx&id=yyy  (or &all=1 to clear all)
export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  const id = req.nextUrl.searchParams.get('id')
  const all = req.nextUrl.searchParams.get('all')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createServiceClient()
  let q = supabase.from('notifications').delete().eq('user_id', userId)
  if (!all) {
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    q = q.eq('id', id)
  }
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
