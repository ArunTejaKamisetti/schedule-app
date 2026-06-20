import { NextResponse } from 'next/server'

// REMOVED (impersonation vector). This endpoint used to map a private import code → user id so a
// new device could "restore" a profile. Under mandatory Google sign-in, identity is the
// authenticated session (auth.uid()) — importing someone else's profile by code is account
// takeover. Kept as a 410 so any stale client gets a clear, safe response instead of a 404.
export function GET() {
  return NextResponse.json(
    { error: 'Profile import has been removed. Sign in with your college Google account.' },
    { status: 410 }
  )
}
