import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { istNow } from '@/lib/attendance'
import { selectUpcoming, toMinutes, reminderText, reminderDedupKey } from '@/lib/reminders'
import { sendPush, insertNotificationsDeduped, type NotifRow } from '@/lib/notify'
import type { Course, PushSubscriptionJSON } from '@/lib/types'

export const maxDuration = 60

// POST /api/cron/class-reminders — push a heads-up ~14 min before each of a user's classes.
// Run it frequently (cron-job.org, every ~5 min). Idempotent: the notification dedup key
// guarantees one reminder per class occurrence per user, so overlapping ticks never double-fire.
const LEAD_MIN = 14

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { todayISO, nowHM } = istNow()
  const nowMin = toMinutes(nowHM)

  // Today's sessions (classes + common events) starting within the next LEAD minutes.
  const { data: today } = await supabase
    .from('courses')
    .select('id, course_code, course_name, start_time, room, session_date, is_cancelled, is_common')
    .eq('session_date', todayISO)
  const upcoming = selectUpcoming((today ?? []) as Course[], nowMin, LEAD_MIN)
  if (upcoming.length === 0) return NextResponse.json({ ok: true, upcoming: 0, pushed: 0 })

  // Push-enabled users.
  const { data: pushUsers } = await supabase
    .from('users').select('id, push_subscription').not('push_subscription', 'is', null)
  const subByUser = new Map<string, PushSubscriptionJSON>()
  for (const u of pushUsers ?? []) subByUser.set(u.id, u.push_subscription as PushSubscriptionJSON)
  if (subByUser.size === 0) return NextResponse.json({ ok: true, upcoming: upcoming.length, pushed: 0 })

  // code → enrolled user ids (resolved by CODE, so sessions added after a pick still count).
  const classCodes = [...new Set(upcoming.filter((s) => !s.is_common).map((s) => s.course_code))]
  const enrolledByCode = new Map<string, Set<string>>()
  if (classCodes.length > 0) {
    const { data: enr } = await supabase
      .from('user_courses')
      .select('user_id, courses!inner(course_code)')
      .in('courses.course_code', classCodes)
    for (const row of enr ?? []) {
      const code = (row as { courses?: { course_code?: string } }).courses?.course_code
      const uid = (row as { user_id: string }).user_id
      if (!code) continue
      if (!enrolledByCode.has(code)) enrolledByCode.set(code, new Set())
      enrolledByCode.get(code)!.add(uid)
    }
  }

  // Build one reminder row per (recipient, upcoming session). Common events go to everyone.
  const rows: NotifRow[] = []
  for (const s of upcoming) {
    const minsUntil = toMinutes(s.start_time) - nowMin
    const { title, body } = reminderText(s, minsUntil)
    const recipients = s.is_common ? [...subByUser.keys()] : [...(enrolledByCode.get(s.course_code) ?? [])]
    for (const userId of recipients) {
      if (!subByUser.has(userId)) continue
      rows.push({
        user_id: userId, title, body, type: 'class_reminder', course_id: s.id,
        read: true, // delivered via push; keep it from inflating the unread bell badge
        dedup_key: reminderDedupKey(s),
      })
    }
  }
  if (rows.length === 0) return NextResponse.json({ ok: true, upcoming: upcoming.length, pushed: 0 })

  // Idempotent — only genuinely new reminders come back (one per class occurrence per user).
  const fresh = await insertNotificationsDeduped(supabase, rows)

  let pushed = 0
  for (const f of fresh) {
    const sub = subByUser.get(f.user_id)
    if (!sub) continue
    await sendPush(sub, f.title, f.body, '/today')
      .then(() => { pushed++ })
      .catch(async () => { await supabase.from('users').update({ push_subscription: null }).eq('id', f.user_id) })
  }

  return NextResponse.json({ ok: true, upcoming: upcoming.length, reminders: rows.length, pushed })
}
