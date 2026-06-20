import { NextResponse } from 'next/server'
import { makeCalendarOAuthClient, GCAL_SCOPES } from '@/lib/gcal'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// GET /api/calendar/google/connect — start per-user Calendar OAuth for the SIGNED-IN user.
// Same-origin top-level navigation, so the session cookie is present; identity is never taken
// from the query. `state` carries the verified uid (CSRF + so the callback knows who consented).
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()

  const client = makeCalendarOAuthClient()
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: GCAL_SCOPES,
    prompt: 'consent',     // force refresh_token
    state: session.userId,
  })
  return NextResponse.redirect(url)
}
