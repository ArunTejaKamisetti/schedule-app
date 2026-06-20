import { NextRequest, NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

const ALLOWED = ['notify_cancelled', 'notify_rescheduled', 'notify_room', 'notify_daily_summary'] as const

// PATCH /api/user/prefs  { prefs: {...} }  → update the signed-in user's notification prefs.
export async function PATCH(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { prefs } = await req.json()
  if (!prefs || typeof prefs !== 'object') {
    return NextResponse.json({ error: 'Missing prefs' }, { status: 400 })
  }

  // Whitelist the boolean pref columns.
  const update: Record<string, boolean> = {}
  for (const key of ALLOWED) {
    if (key in prefs) update[key] = !!prefs[key]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid prefs' }, { status: 400 })
  }

  const { error } = await supabase.from('users').update(update).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
