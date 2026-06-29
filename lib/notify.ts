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

type Recipient = NotifPrefs & { id: string; push_subscription: PushSubscriptionJSON | null }

// Honour per-type notification preferences (Settings checkboxes).
function wantsChange(prefs: NotifPrefs, type: CourseChange['type']): boolean {
  switch (type) {
    case 'cancelled': return prefs.notify_cancelled !== false
    case 'rescheduled': return prefs.notify_rescheduled !== false
    case 'room_change': return prefs.notify_room !== false
    default: return true // added | removed | schedule_update
  }
}

export async function notifyAffectedUsers(changes: CourseChange[], year: 1 | 2 = 2): Promise<void> {
  if (changes.length === 0) return
  const supabase = createServiceClient()

  // course_code → id (this year) for the notification row's course_id.
  const affectedCodes = [...new Set(changes.map((c) => c.course_code))]
  const { data: coursesRaw } = await supabase
    .from('courses').select('id, course_code').eq('year', year).in('course_code', affectedCodes)
  const courses = (coursesRaw ?? []) as { id: string; course_code: string }[]
  const courseIdMap = new Map(courses.map((c) => [c.course_code, c.id] as [string, string]))

  // Resolve recipients → their relevant changes. 1st-year users are matched by SECTION; 2nd-year
  // users by their enrolled course codes.
  const perUser = new Map<string, { sub: PushSubscriptionJSON | null; notifs: CourseChange[] }>()
  const subByUser = new Map<string, PushSubscriptionJSON | null>()

  if (year === 1) {
    const sections = [...new Set(changes.map((c) => c.new?.sheet_tab ?? c.old?.sheet_tab).filter((s): s is string => !!s && s !== 'COMMON'))]
    if (sections.length === 0) return
    const { data: users } = await supabase
      .from('users')
      .select('id, push_subscription, section, notify_cancelled, notify_rescheduled, notify_room')
      .eq('year', 1).in('section', sections)
    for (const u of (users ?? []) as (Recipient & { section: string })[]) {
      const relevant = changes.filter((ch) => (ch.new?.sheet_tab ?? ch.old?.sheet_tab) === u.section && wantsChange(u, ch.type))
      if (relevant.length === 0) continue
      perUser.set(u.id, { sub: u.push_subscription, notifs: relevant })
      subByUser.set(u.id, u.push_subscription)
    }
  } else {
    if (courses.length === 0) return
    // 2nd-year: recipients are users enrolled (by code) in an affected course. Reads the
    // normalized `enrollments` table (one row per pick) rather than the per-session `user_courses`.
    const { data: enrolled } = await supabase
      .from('enrollments')
      .select('user_id, course_code, users(id, push_subscription, notify_cancelled, notify_rescheduled, notify_room)')
      .in('course_code', affectedCodes)
    for (const enrollment of enrolled ?? []) {
      // Supabase types a to-one join as an array; at runtime `users` is the single related row.
      const row = enrollment as unknown as { course_code: string; users: Recipient | null }
      const user = row.users
      if (!user) continue
      const code = row.course_code
      const relevant = changes.filter((ch) => ch.course_code === code && wantsChange(user, ch.type))
      if (relevant.length === 0) continue
      if (!perUser.has(user.id)) perUser.set(user.id, { sub: user.push_subscription, notifs: [] })
      perUser.get(user.id)!.notifs.push(...relevant)
      subByUser.set(user.id, user.push_subscription)
    }
  }

  // Build ALL alert rows (deduped within each user), then do ONE bulk idempotent insert.
  const allRows: NotifRow[] = []
  for (const [userId, { notifs }] of perUser) {
    const seen = new Set<string>()
    for (const ch of notifs) {
      const k = dedupKey(ch)
      if (seen.has(k)) continue
      seen.add(k)
      allRows.push({
        user_id: userId, title: buildTitle(ch), body: buildBody(ch), type: ch.type,
        course_id: courseIdMap.get(ch.course_code) ?? null, read: false, dedup_key: k,
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
