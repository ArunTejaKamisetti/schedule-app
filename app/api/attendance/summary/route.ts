import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { Course } from '@/lib/types'

// Per-picked-course attendance stats + meta.
// GET /api/attendance/summary?userId=…
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const supabase = createServiceClient()
  const [enrolledRes, attRes] = await Promise.all([
    supabase.from('user_courses').select('courses(*)').eq('user_id', userId),
    supabase.from('attendance').select('course_id, status').eq('user_id', userId),
  ])
  if (enrolledRes.error) return NextResponse.json({ error: enrolledRes.error.message }, { status: 500 })

  const sessions = (enrolledRes.data ?? []).map((r: { courses: Course }) => r.courses).filter(Boolean)
  const attByCourse = new Map<string, string>()
  for (const a of attRes.data ?? []) attByCourse.set(a.course_id, a.status)

  // IST "now" (sheet timezone) — date AND time, so a class later today still counts
  // as "left" until its start time passes.
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const today = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`
  const nowHM = `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`

  type Stat = {
    code: string; name: string; area: string | null; instructor: string | null; room: string | null; credits: string | null
    total: number; held: number; present: number; absent: number; left: number; expected: number
  }
  const map = new Map<string, Stat>()

  for (const s of sessions) {
    if (s.is_common) continue
    let st = map.get(s.course_code)
    if (!st) {
      const cr = parseInt(s.credits ?? '') || 0
      st = {
        code: s.course_code, name: s.course_name, area: s.area, instructor: s.instructor, room: s.room, credits: s.credits,
        total: 0, held: 0, present: 0, absent: 0, left: 0, expected: cr * 8,
      }
      map.set(s.course_code, st)
    }
    if (s.is_cancelled) continue
    st.total++
    const d = s.session_date ?? ''
    // Held only once the class has actually started (date + time, not just date).
    const isPast = d < today || (d === today && (s.start_time ?? '23:59') <= nowHM)
    if (isPast) st.held++; else st.left++
    const status = attByCourse.get(s.id)
    if (status === 'present') st.present++
    else if (status === 'absent') st.absent++
  }

  return NextResponse.json([...map.values()])
}
