import { NextRequest, NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// Identity is the signed-in user (session cookie); RLS enforces auth.uid() = user_id.

// GET /api/notifications  → latest 50 for the signed-in user
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { data, error } = await supabase
    .from('notifications')
    .select('*, course:course_id(course_code, course_name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/notifications  { notificationId?, markAll? }  → mark as read
export async function PATCH(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { notificationId, markAll } = await req.json()

  if (markAll) {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId)
  } else if (notificationId) {
    await supabase.from('notifications').update({ read: true }).eq('id', notificationId).eq('user_id', userId)
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/notifications?id=yyy  (or &all=1 to clear all) for the signed-in user
export async function DELETE(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const id = req.nextUrl.searchParams.get('id')
  const all = req.nextUrl.searchParams.get('all')

  let q = supabase.from('notifications').delete().eq('user_id', userId)
  if (!all) {
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    q = q.eq('id', id)
  }
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
