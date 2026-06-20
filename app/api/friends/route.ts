import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserByShareCode } from '@/lib/user'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// The caller is always the SIGNED-IN user (session cookie), never a client-supplied userId. These
// handlers use the service client because they read/write the OTHER endpoint's rows (friend's
// display name; the reciprocal friendship row) which per-user RLS would block — so authorization
// is enforced here in code instead.

// GET /api/friends  → the signed-in user's friends
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('friendships')
    .select('*, friend:friend_id(id, share_code, display_name)')
    .eq('user_id', session.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/friends  { shareCode }  → add a friend by their share code (mutual, accepted)
export async function POST(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const userId = session.userId

  const { shareCode } = await req.json()
  if (!shareCode) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const friend = await getUserByShareCode(shareCode)
  if (!friend) return NextResponse.json({ error: 'User not found with that code' }, { status: 404 })
  if (friend.id === userId) return NextResponse.json({ error: "That's your own code!" }, { status: 400 })

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status')
    .eq('user_id', userId)
    .eq('friend_id', friend.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already friends or request pending', status: existing.status }, { status: 409 })
  }

  await supabase.from('friendships').insert([
    { user_id: userId, friend_id: friend.id, status: 'accepted' },
    { user_id: friend.id, friend_id: userId, status: 'accepted' },
  ])

  return NextResponse.json({ ok: true, friend: { id: friend.id, display_name: friend.display_name, share_code: friend.share_code } })
}

// DELETE /api/friends?friendId=yyy  → remove both directions of the signed-in user's friendship
export async function DELETE(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const userId = session.userId

  const friendId = req.nextUrl.searchParams.get('friendId')
  if (!friendId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const supabase = createServiceClient()
  await supabase.from('friendships').delete()
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)

  return NextResponse.json({ ok: true })
}
