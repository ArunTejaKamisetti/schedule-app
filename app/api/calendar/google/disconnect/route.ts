import { NextRequest, NextResponse } from 'next/server'
import { disconnectGoogleCalendar } from '@/lib/gcal'

// POST /api/calendar/google/disconnect — remove pushed events + stored tokens.
export async function POST(req: NextRequest) {
  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  await disconnectGoogleCalendar(userId)
  return NextResponse.json({ ok: true })
}
