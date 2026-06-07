import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { compareSchedules } from '@/lib/clashes'
import type { Course } from '@/lib/types'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  const friendId = req.nextUrl.searchParams.get('friendId')
  if (!userId || !friendId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const supabase = createServiceClient()

  const [myResult, friendResult] = await Promise.all([
    supabase.from('user_courses').select('courses(*)').eq('user_id', userId),
    supabase.from('user_courses').select('courses(*)').eq('user_id', friendId),
  ])

  const myCourses = (myResult.data ?? []).map((r) => (r as any).courses as Course).filter(Boolean)
  const friendCourses = (friendResult.data ?? []).map((r) => (r as any).courses as Course).filter(Boolean)

  const result = compareSchedules(myCourses, friendCourses)
  return NextResponse.json({ ...result, myCourses, friendCourses })
}
