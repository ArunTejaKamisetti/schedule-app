import { NextResponse } from 'next/server'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'
import { SHEET_SOURCES } from '@/lib/sheets-config'

// GET /api/source-sheet — the Google Sheet URL for the SIGNED-IN user's year, so "View Original
// Sheet" in Settings opens the 1st-year sheet for 1st-years and the 2nd-year sheet for 2nd-years.
// Admins (poweruser) get the 2nd-year sheet by default. Sheet ids are view-access, not secrets.
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const { supabase, userId } = session

  const { data: u } = await supabase.from('users').select('year, role, section').eq('id', userId).maybeSingle()
  const year = (u?.role === 'admin' || u?.year !== 1) ? 2 : 1

  const source = SHEET_SOURCES.find((s) => s.year === year && s.sheetId) ?? SHEET_SOURCES.find((s) => s.sheetId)
  const url = source?.sheetId ? `https://docs.google.com/spreadsheets/d/${source.sheetId}` : null

  return NextResponse.json({ url, year })
}
