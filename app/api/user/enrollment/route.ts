import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Set a user's year (and, for 1st-years, their section). A user is one year at a time; the
// other year's setup is preserved (the year-aware user_sessions RPC just reads the active one).
//   POST { userId, year: 1 | 2, section?: 'A'..'H'|'LSM'|'FIN' }
export async function POST(req: NextRequest) {
  const { userId, year, section } = await req.json()
  if (!userId || (year !== 1 && year !== 2)) {
    return NextResponse.json({ error: 'Missing userId or invalid year' }, { status: 400 })
  }
  const supabase = createServiceClient()
  const patch = year === 1
    ? { year: 1, section: (section ?? '').toString().toUpperCase() || null }
    : { year: 2 } // keep section as-is; it's ignored while year=2
  const { error } = await supabase.from('users').update(patch).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
