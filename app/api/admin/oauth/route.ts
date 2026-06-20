import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireAdmin } from '@/lib/admin'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
]

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

// Step 1: Redirect to Google consent (admin only — this provisions the institutional sheet token).
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  const oauth2Client = getOAuth2Client()
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
  return NextResponse.redirect(url)
}
