import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

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

// Step 1: Redirect to Google consent
export async function GET() {
  const oauth2Client = getOAuth2Client()
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
  return NextResponse.redirect(url)
}
