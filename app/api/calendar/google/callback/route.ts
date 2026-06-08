import { NextRequest, NextResponse } from 'next/server'
import { makeCalendarOAuthClient, syncGoogleCalendarForUser } from '@/lib/gcal'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/calendar/google/callback — store per-user Calendar tokens, run initial push.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const userId = req.nextUrl.searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (!code || !userId) {
    return NextResponse.redirect(`${appUrl}/settings?gcal=error`)
  }

  try {
    const client = makeCalendarOAuthClient()
    const { tokens } = await client.getToken(code)

    const supabase = createServiceClient()
    await supabase.from('user_calendar_tokens').upsert({
      user_id: userId,
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      target_calendar_id: 'primary',
      updated_at: new Date().toISOString(),
    })

    // Initial push so the user's calendar fills immediately.
    await syncGoogleCalendarForUser(userId).catch((e) => console.error('initial gcal sync', e))

    return NextResponse.redirect(`${appUrl}/settings?gcal=connected`)
  } catch (e) {
    console.error('gcal callback error', e)
    return NextResponse.redirect(`${appUrl}/settings?gcal=error`)
  }
}
