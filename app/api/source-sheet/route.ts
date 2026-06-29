import { NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSheetSources } from '@/lib/schedule-sources'

// GET /api/source-sheet — the Google Sheet URL for the SIGNED-IN user's year, so "View Original
// Sheet" in Settings opens the 1st-year sheet for 1st-years and the 2nd-year sheet for 2nd-years.
// Admins (poweruser) get the 2nd-year sheet by default, but may pass `?year=1|2` to follow the
// Schedule tab's year switch (the override is ignored for students — they only ever see their own
// year). The sheet id is resolved from the admin-pasted link (`schedule_sources`), not the static
// registry, so it reflects the current term. Sheet ids are view-access, not secrets.
export async function GET(request: Request) {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { data: u } = await supabase.from('users').select('year, role').eq('id', userId).maybeSingle()
  const isAdmin = u?.role === 'admin'
  const requested = new URL(request.url).searchParams.get('year')
  const adminYear = requested === '1' ? 1 : requested === '2' ? 2 : null
  const year = isAdmin ? (adminYear ?? 2) : (u?.year === 1 ? 1 : 2)

  const sources = await resolveSheetSources(createServiceClient())
  const source = sources.find((s) => s.year === year && s.sheetId) ?? sources.find((s) => s.sheetId)
  const url = source?.sheetId ? `https://docs.google.com/spreadsheets/d/${source.sheetId}` : null

  return NextResponse.json({ url, year })
}
