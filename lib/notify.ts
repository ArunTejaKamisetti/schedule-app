import webpush from 'web-push'
import { createServiceClient } from './supabase/server'
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

  // Group changes by course_code → user
  const userNotifications = new Map<string, { userId: string; sub: PushSubscriptionJSON | null; notifs: CourseChange[] }>()

  for (const enrollment of enrollments) {
    const user = (enrollment as any).users as (NotifPrefs & { id: string; push_subscription: PushSubscriptionJSON | null }) | null
    if (!user) continue
    const course = courseIdMap.get(
      courses.find((c) => c.id === enrollment.course_id)?.course_code ?? ''
    )
    const relevantChanges = changes.filter(
      (ch) => ch.course_code === course?.course_code && wantsChange(user, ch.type)
    )
    if (relevantChanges.length === 0) continue

    if (!userNotifications.has(user.id)) {
      userNotifications.set(user.id, {
        userId: user.id,
        sub: user.push_subscription,
        notifs: [],
      })
    }
    userNotifications.get(user.id)!.notifs.push(...relevantChanges)
  }

  for (const { userId, sub, notifs } of userNotifications.values()) {
    // Store in-app notifications
    const rows = notifs.map((ch) => ({
      user_id: userId,
      title: buildTitle(ch),
      body: buildBody(ch),
      type: ch.type,
      course_id: courseIdMap.get(ch.course_code)?.id ?? null,
      read: false,
    }))

    await supabase.from('notifications').insert(rows)

    // Send push notification (batch changes into one notification per user)
    if (sub) {
      const summary = buildPushSummary(notifs)
      await sendPush(sub, summary.title, summary.body).catch(() => {
        // Subscription expired — clear it
        supabase.from('users').update({ push_subscription: null }).eq('id', userId)
      })
    }
  }
}

function buildTitle(ch: CourseChange): string {
  switch (ch.type) {
    case 'cancelled': return `${ch.course_name} — Cancelled`
    case 'rescheduled': return `${ch.course_name} — Rescheduled`
    case 'room_change': return `${ch.course_name} — Room Changed`
    case 'added': return `New: ${ch.course_name}`
    case 'removed': return `Removed: ${ch.course_name}`
    case 'schedule_update': return `${ch.course_name} — Schedule Updated`
  }
}

function buildBody(ch: CourseChange): string {
  const when = ch.new?.session_date ?? ch.old?.session_date ?? ''
  switch (ch.type) {
    case 'cancelled':
      return `${when} ${ch.old?.start_time ?? ''} session has been cancelled.`
    case 'rescheduled':
      return ch.note ? `${when}: ${ch.note}` : `Rescheduled to ${ch.new?.start_time}`
    case 'room_change':
      return ch.note ? `${when}: ${ch.note}` : `Class changed from ${ch.old?.room ?? '?'} → ${ch.new?.room ?? '?'}`
    case 'added':
      return `${when} ${ch.new?.start_time}–${ch.new?.end_time} in Class ${ch.new?.room ?? 'TBD'}`
    case 'removed':
      return `${when} ${ch.old?.start_time} session has been removed.`
    case 'schedule_update':
      return ch.note ? `${when}: ${ch.note}` : 'This session was updated. Tap to view.'
  }
}

function buildPushSummary(changes: CourseChange[]): { title: string; body: string } {
  if (changes.length === 1) {
    return { title: buildTitle(changes[0]), body: buildBody(changes[0]) }
  }
  return {
    title: 'Schedule Updated',
    body: `${changes.length} changes to your schedule. Tap to view.`,
  }
}

export async function sendPush(
  sub: PushSubscriptionJSON,
  title: string,
  body: string,
  url = '/notifications'
): Promise<void> {
  initVapid()
  await webpush.sendNotification(
    sub as Parameters<typeof webpush.sendNotification>[0],
    JSON.stringify({ title, body, icon: '/icon-192.png', url })
  )
}
