import webpush from 'web-push'
import { createServiceClient } from './supabase/server'
import { buildTitle, buildBody, dedupKey } from './notify-format'
import type { CourseChange, PushSubscriptionJSON } from './types'

interface NotifPrefs {
  notify_cancelled?: boolean
  notify_rescheduled?: boolean
  notify_room?: boolean
}

function initVapid() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL
  if (pub && priv && email && pub !== 'your_vapid_public_key') {
    webpush.setVapidDetails(email, pub, priv)
  }
}

export async function notifyAffectedUsers(changes: CourseChange[]): Promise<void> {
  if (changes.length === 0) return

  const supabase = createServiceClient()

  // Get all course IDs affected
  const affectedCodes = [...new Set(changes.map((c) => c.course_code))]

  // Find courses in DB with those codes
  const { data: courses } = await supabase
    .from('courses')
    .select('id, course_code, course_name')
    .in('course_code', affectedCodes)

  if (!courses || courses.length === 0) return

  const courseIdMap = new Map(courses.map((c) => [c.course_code, c]))

  // Find all users enrolled in affected courses
  const courseIds = courses.map((c) => c.id)
  const { data: enrollments } = await supabase
    .from('user_courses')
    .select('user_id, course_id, users(id, push_subscription, notify_cancelled, notify_rescheduled, notify_room)')
    .in('course_id', courseIds)

  if (!enrollments) return

  // Honour per-type notification preferences (Settings checkboxes).
  function wantsChange(prefs: NotifPrefs, type: CourseChange['type']): boolean {
    switch (type) {
      case 'cancelled': return prefs.notify_cancelled !== false
      case 'rescheduled': return prefs.notify_rescheduled !== false
      case 'room_change': return prefs.notify_room !== false
      default: return true // added | removed | schedule_update
    }
  }

  // course_id → course (avoids an O(enrollments × courses) .find at 500-student scale).
  const courseById = new Map(courses.map((c) => [c.id, c]))

  // Per-user relevant changes (honouring the Settings prefs).
  const perUser = new Map<string, { sub: PushSubscriptionJSON | null; notifs: CourseChange[] }>()
  for (const enrollment of enrollments) {
    const user = (enrollment as any).users as (NotifPrefs & { id: string; push_subscription: PushSubscriptionJSON | null }) | null
    if (!user) continue
    const course = courseById.get((enrollment as { course_id: string }).course_id)
    if (!course) continue
    const relevant = changes.filter((ch) => ch.course_code === course.course_code && wantsChange(user, ch.type))
    if (relevant.length === 0) continue
    if (!perUser.has(user.id)) perUser.set(user.id, { sub: user.push_subscription, notifs: [] })
    perUser.get(user.id)!.notifs.push(...relevant)
  }

  // Build ALL alert rows across every affected user (deduped within each user), then do ONE
  // bulk idempotent insert — instead of a query per user. Scales to hundreds of recipients.
  const subByUser = new Map<string, PushSubscriptionJSON | null>()
  const allRows: NotifRow[] = []
  for (const [userId, { sub, notifs }] of perUser) {
    subByUser.set(userId, sub)
    const seen = new Set<string>()
    for (const ch of notifs) {
      const k = dedupKey(ch)
      if (seen.has(k)) continue
      seen.add(k)
      allRows.push({
        user_id: userId, title: buildTitle(ch), body: buildBody(ch), type: ch.type,
        course_id: courseIdMap.get(ch.course_code)?.id ?? null, read: false, dedup_key: k,
      })
    }
  }

  const fresh = await insertNotificationsDeduped(supabase, allRows)
  if (fresh.length === 0) return

  // One push summary per user, sent in PARALLEL (chunked) — a change hitting 100+ of 500
  // students no longer serialises into a 60s-busting loop.
  const freshByUser = new Map<string, { title: string; body: string }[]>()
  for (const f of fresh) {
    if (!freshByUser.has(f.user_id)) freshByUser.set(f.user_id, [])
    freshByUser.get(f.user_id)!.push({ title: f.title, body: f.body })
  }
  const targets = [...freshByUser.entries()].filter(([userId]) => subByUser.get(userId))
  const CHUNK = 50
  for (let i = 0; i < targets.length; i += CHUNK) {
    await Promise.all(targets.slice(i, i + CHUNK).map(async ([userId, items]) => {
      const sub = subByUser.get(userId)!
      const summary = items.length === 1
        ? items[0]
        : { title: 'Schedule Updated', body: `${items.length} changes to your schedule. Tap to view.` }
      await sendPush(sub, summary.title, summary.body).catch(() =>
        supabase.from('users').update({ push_subscription: null }).eq('id', userId)
      )
    }))
  }
}

export type NotifRow = {
  user_id: string; title: string; body: string; type: string
  course_id: string | null; read: boolean; dedup_key: string
}

// Insert notifications and return ONLY the rows actually created — so callers push exactly the
// new ones. Dedup is the (user_id, dedup_key) unique index from migration 009. That index is
// PARTIAL (WHERE dedup_key IS NOT NULL), which PostgREST's upsert/onConflict can't infer, so we
// filter out already-present keys and plain-insert; the unique index still backstops any
// concurrent race (a duplicate insert simply fails and is skipped). Shared by change alerts and
// class reminders.
export async function insertNotificationsDeduped(
  supabase: ReturnType<typeof createServiceClient>,
  rows: NotifRow[]
): Promise<{ user_id: string; title: string; body: string }[]> {
  if (rows.length === 0) return []
  const keys = [...new Set(rows.map((r) => r.dedup_key))]
  const { data: existing } = await supabase
    .from('notifications').select('user_id, dedup_key').in('dedup_key', keys)
  const have = new Set((existing ?? []).map((e: { user_id: string; dedup_key: string }) => `${e.user_id}::${e.dedup_key}`))
  const toInsert = rows.filter((r) => !have.has(`${r.user_id}::${r.dedup_key}`))
  if (toInsert.length === 0) return []
  const { data } = await supabase.from('notifications').insert(toInsert).select('user_id, title, body')
  return (data ?? []) as { user_id: string; title: string; body: string }[]
}

export async function sendPush(
  sub: PushSubscriptionJSON,
  title: string,
  body: string,
  url = '/today?alerts=1'
): Promise<void> {
  initVapid()
  await webpush.sendNotification(
    sub as Parameters<typeof webpush.sendNotification>[0],
    JSON.stringify({ title, body, icon: '/icon-192', url })
  )
}
