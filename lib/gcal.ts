import { google, calendar_v3 } from 'googleapis'
import { createServiceClient } from './supabase/server'
import { getUserSessions } from './enrollment'
import { getGoogleConfig } from './google-auth'
import type { Course } from './types'

export const GCAL_SCOPES = ['https://www.googleapis.com/auth/calendar.events']

const TIMEZONE = 'Asia/Kolkata'

export function getCalendarRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/api/calendar/google/callback`
}

// Reuses the app's one-time Google client (from the `google_integration` DB row, env as dev
// fallback) so per-user Calendar connect needs no Google vars in env. Throws a clear error if the
// client isn't configured — callers surface that as "Calendar isn't available" rather than a 500.
export async function makeCalendarOAuthClient() {
  const cfg = await getGoogleConfig()
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Google Calendar is not available — the app\'s Google client is not configured.')
  }
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, getCalendarRedirectUri())
}

// Build an OAuth client authenticated for a given user, persisting refreshed tokens.
async function getUserCalendarClient(userId: string) {
  const supabase = createServiceClient()
  const { data: tok } = await supabase
    .from('user_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tok || !tok.refresh_token) return null

  const client = await makeCalendarOAuthClient()
  client.setCredentials({
    refresh_token: tok.refresh_token,
    access_token: tok.access_token ?? undefined,
    expiry_date: tok.expires_at ? new Date(tok.expires_at).getTime() : undefined,
  })

  // Persist rotated access tokens.
  client.on('tokens', (tokens) => {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (tokens.access_token) update.access_token = tokens.access_token
    if (tokens.refresh_token) update.refresh_token = tokens.refresh_token
    if (tokens.expiry_date) update.expires_at = new Date(tokens.expiry_date).toISOString()
    supabase.from('user_calendar_tokens').update(update).eq('user_id', userId).then(() => {})
  })

  return { client, calendarId: tok.target_calendar_id || 'primary' }
}

// Absolute UTC instant for an IST (UTC+5:30) wall-clock time on a given date.
function istInstant(dateISO: string, timeHHMM: string): Date | null {
  if (!dateISO || !timeHHMM) return null
  const [y, m, d] = dateISO.split('-').map(Number)
  const [hh, mm] = timeHHMM.split(':').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0) - 330 * 60000)
}

function buildEvent(course: Course): calendar_v3.Schema$Event | null {
  const start = istInstant(course.session_date ?? '', course.start_time ?? '')
  if (!start) return null
  const end = istInstant(course.session_date ?? '', course.end_time ?? '') ?? new Date(start.getTime() + 75 * 60000)

  const cancelled = course.is_cancelled
  return {
    summary: course.is_common
      ? `📝 ${course.course_name}`
      : `${cancelled ? 'CANCELLED: ' : ''}${course.course_code} — ${course.course_name}`,
    description: course.is_common
      ? 'Common event for all sections.'
      : `Instructor: ${course.instructor ?? 'TBD'}\nRoom: ${course.room ?? 'TBD'}`,
    location: course.room ?? undefined,
    colorId: cancelled ? '11' : course.is_common ? '5' : undefined, // 11=red (cancelled), 5=banana (exam)
    // One-time dated events — each sheet session is its own date (no weekly recurrence).
    start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
  }
}

export interface CalendarPlan {
  toUpsert: Course[]                                       // sessions whose event to create/patch
  toDelete: { courseId: string; eventId: string }[]       // orphaned events to remove
}

// Decide what a single calendar sync must do — kept pure so it can be unit-tested.
//   • changedCodes given (incremental, on a sheet change): only push sessions whose course
//     changed; users not enrolled in any changed course get an empty upsert list.
//   • changedCodes undefined (full sync, e.g. on connect / on pick): push everything current.
// Orphans (mapped events whose course is no longer among the user's current sessions —
// removed from the sheet or unpicked) are always cleaned up, regardless of mode.
export function planCalendarSync(
  current: Course[],
  existing: Map<string, string>,
  changedCodes?: Set<string>
): CalendarPlan {
  const byId = new Map(current.map((c) => [c.id, c]))
  const toUpsert = changedCodes
    ? current.filter((c) => changedCodes.has(c.course_code))
    : current
  const toDelete = [...existing]
    .filter(([courseId]) => !byId.has(courseId))
    .map(([courseId, eventId]) => ({ courseId, eventId }))
  return { toUpsert, toDelete }
}

// Reconcile a user's Google Calendar with their current courses + common events.
// `changedCodes` (optional) limits work to events that actually changed this sync — so a
// routine sheet edit touches a handful of events instead of re-pushing the user's whole term
// (which previously made the sync exceed its 60s budget for several connected users).
export async function syncGoogleCalendarForUser(userId: string, changedCodes?: Set<string>): Promise<void> {
  const auth = await getUserCalendarClient(userId)
  if (!auth) return

  const supabase = createServiceClient()

  const [enrolled, commonRes, mapRes] = await Promise.all([
    getUserSessions(supabase, userId),
    supabase.from('courses').select('*').eq('is_common', true),
    supabase.from('calendar_event_map').select('course_id, gcal_event_id').eq('user_id', userId),
  ])

  const common = (commonRes.data as Course[] | null) ?? []
  const current = [...enrolled, ...common].filter(Boolean) as Course[]
  const existing = new Map<string, string>() // course_id → gcal_event_id
  for (const row of mapRes.data ?? []) existing.set(row.course_id, row.gcal_event_id)

  const { toUpsert, toDelete } = planCalendarSync(current, existing, changedCodes)

  // Nothing to do for this user → make ZERO Google API calls (not even the probe). This is
  // the win: on a typical change, most connected users are unaffected and cost only DB reads.
  if (toUpsert.length === 0 && toDelete.length === 0) return

  const calendar = google.calendar({ version: 'v3', auth: auth.client })
  const calendarId = auth.calendarId

  // Probe — surfaces a disabled API / bad token / missing scope loudly.
  await calendar.events.list({ calendarId, maxResults: 1 })

  for (const course of toUpsert) {
    const event = buildEvent(course)
    if (!event) continue
    const gid = existing.get(course.id)
    try {
      if (gid) {
        await calendar.events.patch({ calendarId, eventId: gid, requestBody: event })
      } else {
        const res = await calendar.events.insert({ calendarId, requestBody: event })
        if (res.data.id) {
          await supabase.from('calendar_event_map').upsert({
            user_id: userId,
            course_id: course.id,
            gcal_event_id: res.data.id,
          })
        }
      }
    } catch (e) {
      // A stale mapping (event deleted by user) — drop it so it re-inserts next run.
      console.error('gcal upsert failed', course.id, e)
      if (gid) await supabase.from('calendar_event_map').delete().eq('user_id', userId).eq('course_id', course.id)
    }
  }

  for (const { courseId, eventId } of toDelete) {
    try {
      await calendar.events.delete({ calendarId, eventId })
    } catch (e) {
      console.error('gcal delete failed', courseId, e)
    }
    await supabase.from('calendar_event_map').delete().eq('user_id', userId).eq('course_id', courseId)
  }
}

export async function syncGoogleCalendarForUsers(userIds: string[], changedCodes?: Set<string>): Promise<void> {
  for (const id of userIds) {
    await syncGoogleCalendarForUser(id, changedCodes).catch((e) => console.error('gcal user sync failed', id, e))
  }
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const auth = await getUserCalendarClient(userId)
  const supabase = createServiceClient()

  if (auth) {
    const calendar = google.calendar({ version: 'v3', auth: auth.client })
    const { data: map } = await supabase
      .from('calendar_event_map')
      .select('gcal_event_id')
      .eq('user_id', userId)
    for (const row of map ?? []) {
      await calendar.events
        .delete({ calendarId: auth.calendarId, eventId: row.gcal_event_id })
        .catch(() => {})
    }
  }

  await supabase.from('calendar_event_map').delete().eq('user_id', userId)
  await supabase.from('user_calendar_tokens').delete().eq('user_id', userId)
}
