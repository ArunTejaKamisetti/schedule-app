import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/calendar/google/status?userId=... — is this user's Google Calendar connected?
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ connected: false })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('user_calendar_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .single()

  return NextResponse.json({ connected: !!data })
}
