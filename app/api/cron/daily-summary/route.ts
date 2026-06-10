import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserSessions } from '@/lib/enrollment'
import { sendPush } from '@/lib/notify'
import type { Course, PushSubscriptionJSON } from '@/lib/types'

export const maxDuration = 60

// POST /api/cron/daily-summary — morning push of today's classes + any notes.
// Add a cron-job.org entry at ~07:00 IST (01:30 UTC) with the CRON_SECRET bearer header.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  // Today's actual date in IST (the schedule is date-based now).
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const today = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`

  const { data: commonToday } = await supabase
    .from('courses').select('*').eq('is_common', true).eq('session_date', today)

  const { data: users } = await supabase
    .from('users')
    .select('id, push_subscription')
    .eq('notify_daily_summary', true)
    .not('push_subscription', 'is', null)

  if (!users || users.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  // Today's notes for everyone, grouped by user.
  const { data: notesToday } = await supabase
    .from('notes').select('user_id, course_id, body').eq('session_date', today)
  const notesByUser = new Map<string, Map<string, string>>()
  for (const n of notesToday ?? []) {
    if (!notesByUser.has(n.user_id)) notesByUser.set(n.user_id, new Map())
    notesByUser.get(n.user_id)!.set(n.course_id, n.body)
  }

  let sent = 0
  for (const user of users) {
    const myToday = (await getUserSessions(supabase, user.id))
      .filter((c) => c.session_date === today)

    const all = [...myToday, ...((commonToday as Course[]) ?? [])]
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

    const userNotes = notesByUser.get(user.id)
    if (all.length === 0 && (!userNotes || userNotes.size === 0)) continue

    const classLines = all.slice(0, 6).map((c) => {
      const note = userNotes?.get(c.id)
      return `${c.start_time ?? ''} ${c.course_code}${c.is_cancelled ? ' (CANCELLED)' : ''}${note ? ` 📝${note}` : ''}`
    })
    // Notes attached to sessions not in `all` (edge case) — append separately.
    const body = classLines.join(' · ') || 'You have reminders today.'

    const sub = user.push_subscription as PushSubscriptionJSON
    await sendPush(
      sub,
      all.length > 0 ? `Today: ${all.length} class${all.length !== 1 ? 'es' : ''}` : 'Today’s reminders',
      body,
      '/today'
    ).then(() => { sent++ }).catch(async () => {
      await supabase.from('users').update({ push_subscription: null }).eq('id', user.id)
    })
  }

  return NextResponse.json({ ok: true, sent })
}
