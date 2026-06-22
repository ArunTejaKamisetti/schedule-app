import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getOAuthClient } from '@/lib/google-auth'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
]

// Step 1: Redirect an admin to Google consent. This is the ONE-TIME authorization that captures the
// institutional sheet-read token (stored in the DB by the callback) — no token is ever pasted into
// env. Offline access + forced consent so Google returns a refresh_token.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  let oauth2Client
  try {
    oauth2Client = await getOAuthClient()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
  return NextResponse.redirect(url)
}
