import { NextRequest, NextResponse } from 'next/server'
import { makeCalendarOAuthClient, GCAL_SCOPES } from '@/lib/gcal'

// GET /api/calendar/google/connect?userId=... — start per-user Calendar OAuth.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return new NextResponse('Missing userId', { status: 400 })

  const client = makeCalendarOAuthClient()
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: GCAL_SCOPES,
    prompt: 'consent',     // force refresh_token
    state: userId,
  })
  return NextResponse.redirect(url)
}
