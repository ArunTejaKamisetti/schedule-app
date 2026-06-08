import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPush } from '@/lib/notify'
import type { Course, PushSubscriptionJSON } from '@/lib/types'

export const maxDuration = 60

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// POST /api/cron/daily-summary — push each opted-in user a summary of today's classes.
// Add a cron-job.org entry (~07:00 IST) with the CRON_SECRET bearer header.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  // Today in IST (the schedule's timezone).
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const today = DAY_CODES[istNow.getUTCDay()]

  // Common events for today (apply to everyone).
  const { data: commonToday } = await supabase
    .from('courses')
    .select('*')
    .eq('is_common', true)
    .eq('day_of_week', today)

  const { data: users } = await supabase
    .from('users')
    .select('id, push_subscription, notify_daily_summary')
    .eq('notify_daily_summary', true)
    .not('push_subscription', 'is', null)

  if (!users || users.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  let sent = 0
  for (const user of users) {
    const { data: enrolled } = await supabase
      .from('user_courses')
      .select('courses(*)')
      .eq('user_id', user.id)

    const myToday = (enrolled ?? [])
      .map((r: { courses: Course }) => r.courses)
      .filter((c: Course | null): c is Course => !!c && c.day_of_week === today)

    const all = [...myToday, ...((commonToday as Course[]) ?? [])]
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

    if (all.length === 0) continue

    const lines = all
      .slice(0, 6)
      .map((c) => `${c.start_time ?? ''} ${c.course_code}${c.is_cancelled ? ' (CANCELLED)' : ''}`)
      .join(' · ')

    const sub = user.push_subscription as PushSubscriptionJSON
    await sendPush(
      sub,
      `Today: ${all.length} class${all.length !== 1 ? 'es' : ''}`,
      lines,
      '/today'
    ).then(() => { sent++ }).catch(async () => {
      await supabase.from('users').update({ push_subscription: null }).eq('id', user.id)
    })
  }

  return NextResponse.json({ ok: true, sent })
}
