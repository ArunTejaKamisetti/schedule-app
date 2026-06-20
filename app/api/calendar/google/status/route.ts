import { NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// GET /api/calendar/google/status — is the signed-in user's Google Calendar connected?
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { data } = await supabase
    .from('user_calendar_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return NextResponse.json({ connected: !!data })
}
