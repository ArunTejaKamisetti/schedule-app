import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserSessions } from '@/lib/enrollment'
import { compareSchedules } from '@/lib/clashes'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// GET /api/friends/compare?friendId=yyy — compare the signed-in user's schedule with a friend's.
// The caller is the session user; `friendId` must be an ACCEPTED friend, or we refuse (otherwise
// anyone could read any user's schedule by guessing ids).
export async function GET(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const userId = session.userId

  const friendId = req.nextUrl.searchParams.get('friendId')
  if (!friendId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const supabase = createServiceClient()

  // Authorize: the caller must actually be friends with friendId.
  const { data: edge } = await supabase
    .from('friendships')
    .select('user_id')
    .eq('user_id', userId).eq('friend_id', friendId).eq('status', 'accepted')
    .maybeSingle()
  if (!edge) return NextResponse.json({ error: 'Not friends' }, { status: 403 })

  // Resolve by code so both schedules reflect the latest sheet state (added/moved sessions).
  const [myCourses, friendCourses] = await Promise.all([
    getUserSessions(supabase, userId),
    getUserSessions(supabase, friendId),
  ])

  const result = compareSchedules(myCourses, friendCourses)
  return NextResponse.json({ ...result, myCourses, friendCourses })
}
