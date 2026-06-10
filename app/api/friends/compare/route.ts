import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserSessions } from '@/lib/enrollment'
import { compareSchedules } from '@/lib/clashes'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  const friendId = req.nextUrl.searchParams.get('friendId')
  if (!userId || !friendId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const supabase = createServiceClient()

  // Resolve by code so both schedules reflect the latest sheet state (added/moved sessions).
  const [myCourses, friendCourses] = await Promise.all([
    getUserSessions(supabase, userId),
    getUserSessions(supabase, friendId),
  ])

  const result = compareSchedules(myCourses, friendCourses)
  return NextResponse.json({ ...result, myCourses, friendCourses })
}
