import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import ical from 'ical-generator'
import type { Course } from '@/lib/types'

const DAY_MAP: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
}

function nextOccurrence(dayName: string, startTime: string): Date {
  const targetDay = DAY_MAP[dayName?.toUpperCase()] ?? 1
  const now = new Date()
  const [h, m] = startTime.split(':').map(Number)
  const date = new Date(now)
  date.setHours(h, m, 0, 0)
  const diff = (targetDay - now.getDay() + 7) % 7
  date.setDate(date.getDate() + (diff === 0 && date < now ? 7 : diff))
  return date
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return new NextResponse('Missing userId', { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_courses')
    .select('courses(*)')
    .eq('user_id', userId)

  if (error) return new NextResponse(error.message, { status: 500 })

  const courses = (data ?? []).map((r) => (r as any).courses as Course).filter(Boolean)

  const cal = ical({
    name: 'My College Schedule',
    prodId: '//CollegeSchedule//App//EN',
    timezone: 'Asia/Kolkata',
  })

  // Semester end — use Dec 31 of current year
  const semesterEnd = new Date(new Date().getFullYear(), 11, 31)

  for (const course of courses) {
    if (!course.day_of_week || !course.start_time || !course.end_time) continue

    const start = nextOccurrence(course.day_of_week, course.start_time)
    const end = new Date(start)
    const [eh, em] = course.end_time.split(':').map(Number)
    end.setHours(eh, em, 0, 0)

    cal.createEvent({
      start,
      end,
      summary: `${course.course_code} — ${course.course_name}`,
      description: `Instructor: ${course.instructor ?? 'TBD'}\nRoom: ${course.room ?? 'TBD'}`,
      location: course.room ?? undefined,
      repeating: {
        freq: 'WEEKLY',
        until: semesterEnd,
      },
    })
  }

  return new NextResponse(cal.toString(), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="schedule.ics"',
      'Cache-Control': 'no-cache',
    },
  })
}
