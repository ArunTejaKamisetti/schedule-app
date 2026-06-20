import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserSessions } from '@/lib/enrollment'
import ical, { ICalEventStatus } from 'ical-generator'
import type { Course } from '@/lib/types'

// DELIBERATE EXCEPTION to "never trust a client-supplied userId": this is an .ics SUBSCRIPTION
// feed that EXTERNAL calendar apps (Apple/Google "add by URL") poll with NO session cookie, so
// cookie auth is impossible here. The `userId` is the random `auth.uid()` UUID, which functions
// as an unguessable bearer capability token for a read-only, low-sensitivity schedule. If stronger
// secrecy is wanted later, swap it for a dedicated rotatable `calendar_token` column (TODO).

// Build the absolute UTC instant for an IST (Asia/Kolkata, UTC+5:30) wall-clock time.
function istInstant(dateISO: string, timeHHMM: string): Date | null {
  if (!dateISO || !timeHHMM) return null
  const [y, m, d] = dateISO.split('-').map(Number)
  const [hh, mm] = timeHHMM.split(':').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0) - 330 * 60000)
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return new NextResponse('Missing userId', { status: 400 })

  const supabase = createServiceClient()

  const [enrolled, commonRes] = await Promise.all([
    getUserSessions(supabase, userId),
    supabase.from('courses').select('*').eq('is_common', true),
  ])

  const common = (commonRes.data as Course[] | null) ?? []

  // Union selected courses + common events (exams etc.), de-duplicated by id.
  const byId = new Map<string, Course>()
  for (const c of [...enrolled, ...common]) if (c) byId.set(c.id, c)
  const courses = [...byId.values()]

  // No `timezone` here on purpose: istInstant() already returns the correct absolute
  // UTC instant, so ical-generator emits DTSTART in UTC (…Z) and the phone converts to
  // local time. Setting a timezone without a VTIMEZONE generator mislabels the UTC value
  // and shifts every event by 5:30h.
  const cal = ical({
    name: 'My College Schedule',
    prodId: '//CollegeSchedule//App//EN',
  })

  for (const course of courses) {
    const start = istInstant(course.session_date ?? '', course.start_time ?? '')
    if (!start) continue
    const end = istInstant(course.session_date ?? '', course.end_time ?? '') ?? new Date(start.getTime() + 75 * 60000)

    const cancelled = course.is_cancelled
    cal.createEvent({
      // Stable per-session UID so subscribed calendars update in place instead of duplicating.
      id: `${course.id}@schedule-app`,
      start,
      end,
      summary: course.is_common
        ? `📝 ${course.course_name}`
        : `${cancelled ? 'CANCELLED: ' : ''}${course.course_code} — ${course.course_name}`,
      description: course.is_common
        ? 'Common event for all sections.'
        : `Instructor: ${course.instructor ?? 'TBD'}\nRoom: ${course.room ?? 'TBD'}`,
      location: course.room ?? undefined,
      status: cancelled ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
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
