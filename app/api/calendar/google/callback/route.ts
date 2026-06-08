import { NextRequest, NextResponse } from 'next/server'
import { makeCalendarOAuthClient, syncGoogleCalendarForUser } from '@/lib/gcal'
import { createServiceClient } from '@/lib/supabase/server'

function fail(appUrl: string, reason: string) {
  return NextResponse.redirect(`${appUrl}/settings?gcal=error&reason=${encodeURIComponent(reason.slice(0, 200))}`)
}

// GET /api/calendar/google/callback — store per-user Calendar tokens, run initial push.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const userId = req.nextUrl.searchParams.get('state')
  const oauthError = req.nextUrl.searchParams.get('error') // e.g. access_denied
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (oauthError) return fail(appUrl, oauthError)
  if (!code || !userId) return fail(appUrl, 'missing code/state')

  const supabase = createServiceClient()

  // 1) Exchange the code for tokens.
  let tokens
  try {
    const client = makeCalendarOAuthClient()
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
