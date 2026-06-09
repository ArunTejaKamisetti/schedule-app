import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPush } from '@/lib/notify'
import type { Course, PushSubscriptionJSON } from '@/lib/types'

export const maxDuration = 60

// POST /api/cron/reminders — push each user their notes for TOMORROW's classes.
// Schedule once daily at ~20:00 IST (14:30 UTC) via cron-job.org with the CRON_SECRET.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  // Tomorrow in IST.
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  ist.setUTCDate(ist.getUTCDate() + 1)
  const tomorrow = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`

  const { data: notes } = await supabase
    .from('notes')
    .select('user_id, body, course:course_id(course_code, course_name, start_time)')
    .eq('session_date', tomorrow)

  if (!notes || notes.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  // Group notes per user.
  const byUser = new Map<string, { code: string; time: string; body: string }[]>()
  for (const n of notes) {
    const c = (n as unknown as { course: Pick<Course, 'course_code' | 'start_time'> | null }).course
    if (!byUser.has(n.user_id)) byUser.set(n.user_id, [])
    byUser.get(n.user_id)!.push({ code: c?.course_code ?? '', time: c?.start_time ?? '', body: n.body })
  }

  const { data: users } = await supabase
    .from('users')
    .select('id, push_subscription')
    .in('id', [...byUser.keys()])
    .not('push_subscription', 'is', null)

  let sent = 0
  for (const user of users ?? []) {
    const items = byUser.get(user.id) ?? []
    if (items.length === 0) continue
    const title = `Reminders for tomorrow (${items.length})`
    const body = items.slice(0, 5).map((i) => `${i.code} ${i.time}: ${i.body}`).join(' · ')
    const sub = user.push_subscription as PushSubscriptionJSON
    await sendPush(sub, title, body, '/today').then(() => { sent++ }).catch(async () => {
      await supabase.from('users').update({ push_subscription: null }).eq('id', user.id)
    })
  }

  return NextResponse.json({ ok: true, sent })
}
