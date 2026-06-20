import { NextRequest, NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// POST /api/push/subscribe  { subscription }  → save (or clear) the signed-in user's push sub.
export async function POST(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { subscription } = await req.json()
  const { error } = await supabase
    .from('users')
    .update({ push_subscription: subscription ?? null })
    .eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
