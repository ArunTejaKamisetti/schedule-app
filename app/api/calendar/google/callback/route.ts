import { NextRequest, NextResponse } from 'next/server'
import { makeCalendarOAuthClient, syncGoogleCalendarForUser } from '@/lib/gcal'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthedSession } from '@/lib/api-auth'

function fail(appUrl: string, reason: string) {
  return NextResponse.redirect(`${appUrl}/settings?gcal=error&reason=${encodeURIComponent(reason.slice(0, 200))}`)
}

// GET /api/calendar/google/callback — store per-user Calendar tokens, run initial push.
// Identity comes from the SIGNED-IN session (the SameSite=Lax auth cookie rides the top-level
// redirect back from Google), NOT from the client-controlled `state` — otherwise a crafted
// connect link could attach a victim's Google tokens to someone else's account. `state` is only
// cross-checked as a CSRF guard.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const oauthError = req.nextUrl.searchParams.get('error') // e.g. access_denied
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (oauthError) return fail(appUrl, oauthError)
  if (!code) return fail(appUrl, 'missing code')

  const session = await getAuthedSession()
  if (!session) return fail(appUrl, 'not authenticated')
  const userId = session.userId
  if (state && state !== userId) return fail(appUrl, 'state mismatch')

  const supabase = createServiceClient()

  // 1) Exchange the code for tokens.
  let tokens
  try {
    const client = await makeCalendarOAuthClient()
    tokens = (await client.getToken(code)).tokens
  } catch (e) {
    return fail(appUrl, `token exchange failed: ${e instanceof Error ? e.message : 'unknown'}`)
  }

  await supabase.from('user_calendar_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    target_calendar_id: 'primary',
    updated_at: new Date().toISOString(),
  })

  // 2) Initial push — surface failures (e.g. Calendar API not enabled) instead of
  //    silently "connecting" with an empty calendar.
  try {
    await syncGoogleCalendarForUser(userId)
  } catch (e) {
    return fail(appUrl, `calendar write failed: ${e instanceof Error ? e.message : 'unknown'}`)
  }

  return NextResponse.redirect(`${appUrl}/settings?gcal=connected`)
}
