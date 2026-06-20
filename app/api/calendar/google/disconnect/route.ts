import { NextResponse } from 'next/server'
import { disconnectGoogleCalendar } from '@/lib/gcal'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// POST /api/calendar/google/disconnect — remove the signed-in user's pushed events + tokens.
export async function POST() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()

  await disconnectGoogleCalendar(session.userId)
  return NextResponse.json({ ok: true })
}
