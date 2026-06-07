import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserByShareCode } from '@/lib/user'

// GET /api/friends?userId=xxx  → list friends
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('friendships')
    .select('*, friend:friend_id(id, share_code, display_name)')
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/friends  → send friend request by share code
export async function POST(req: NextRequest) {
  const { userId, shareCode } = await req.json()
  if (!userId || !shareCode) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const friend = await getUserByShareCode(shareCode)
  if (!friend) return NextResponse.json({ error: 'User not found with that code' }, { status: 404 })
  if (friend.id === userId) return NextResponse.json({ error: "That's your own code!" }, { status: 400 })

  const supabase = createServiceClient()

  // Check if already friends
  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status')
    .eq('user_id', userId)
    .eq('friend_id', friend.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Already friends or request pending', status: existing.status }, { status: 409 })
  }

  // Create friendship (mutual — both directions accepted immediately for simplicity)
  await supabase.from('friendships').insert([
    { user_id: userId, friend_id: friend.id, status: 'accepted' },
    { user_id: friend.id, friend_id: userId, status: 'accepted' },
  ])

  return NextResponse.json({ ok: true, friend: { id: friend.id, display_name: friend.display_name, share_code: friend.share_code } })
}

// DELETE /api/friends?userId=xxx&friendId=yyy
export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  const friendId = req.nextUrl.searchParams.get('friendId')
  if (!userId || !friendId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const supabase = createServiceClient()
  await supabase.from('friendships').delete()
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)

  return NextResponse.json({ ok: true })
}
