import { NextRequest, NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'

// Set the signed-in user's year (and, for 1st-years, their section). A user is one year at a time;
// the other year's setup is preserved (the year-aware user_sessions RPC reads the active one).
//   POST { year: 1 | 2, section?: 'A'..'H'|'LSM'|'FIN' }
export async function POST(req: NextRequest) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { year, section } = await req.json()
  if (year !== 1 && year !== 2) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }
  const patch = year === 1
    ? { year: 1, section: (section ?? '').toString().toUpperCase() || null }
    : { year: 2 } // keep section as-is; it's ignored while year=2
  const { error } = await supabase.from('users').update(patch).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
