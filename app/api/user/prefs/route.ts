import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ALLOWED = ['notify_cancelled', 'notify_rescheduled', 'notify_room', 'notify_daily_summary'] as const

export async function PATCH(req: NextRequest) {
  const { userId, prefs } = await req.json()
  if (!userId || !prefs || typeof prefs !== 'object') {
    return NextResponse.json({ error: 'Missing userId or prefs' }, { status: 400 })
  }

  // Whitelist the boolean pref columns.
  const update: Record<string, boolean> = {}
  for (const key of ALLOWED) {
    if (key in prefs) update[key] = !!prefs[key]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid prefs' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('users').update(update).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
