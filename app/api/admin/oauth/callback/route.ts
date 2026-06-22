import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getOAuthClient, storeSheetRefreshToken } from '@/lib/google-auth'

// Step 2: Google redirects here with a code. Admin-gated — without it, anyone hitting the URL with a
// code could mint a token. We exchange the code and store the refresh token SERVER-SIDE in the DB
// (`google_integration`), never rendering it into HTML or logs. The admin is bounced to the schedule
// admin page; sync (on-demand and cron) reads the stored token from then on.
export async function GET(req: NextRequest) {
  const adminEmail = await requireAdmin()
  if (!adminEmail) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const origin = req.nextUrl.origin
  const code = req.nextUrl.searchParams.get('code')
  const errorParam = req.nextUrl.searchParams.get('error')
  if (!code) {
    // Don't echo req.url back — it can carry the auth `code`/secrets in the query string.
    return NextResponse.redirect(`${origin}/admin/schedule?google=error&reason=${encodeURIComponent(errorParam ?? 'no_code')}`)
  }

  try {
    const oauth2Client = await getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on the first consent; force it again.
      return NextResponse.redirect(`${origin}/admin/schedule?google=error&reason=no_refresh_token`)
    }
    await storeSheetRefreshToken(tokens.refresh_token, adminEmail)
    return NextResponse.redirect(`${origin}/admin/schedule?google=connected`)
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'exchange_failed'
    return NextResponse.redirect(`${origin}/admin/schedule?google=error&reason=${encodeURIComponent(reason)}`)
  }
}
