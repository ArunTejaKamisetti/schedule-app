import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { SHEET_SOURCES } from '@/lib/sheets-config'
import { parseSheetId } from '@/lib/sheet-url'

export const runtime = 'nodejs'

// POST /api/admin/schedule/source  { sourceKey, url }
// Stores the admin-pasted Google Sheet link for a source (per term). The pasted URL/id is parsed to
// a spreadsheet id and upserted into `schedule_sources`; the next sync reads it. Admin-gated.
export async function POST(req: NextRequest) {
  const adminEmail = await requireAdmin()
  if (!adminEmail) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const sourceKey = String(body?.sourceKey ?? '')
  const url = String(body?.url ?? '')

  if (!SHEET_SOURCES.some((s) => s.key === sourceKey)) {
    return NextResponse.json({ error: `Unknown sourceKey. Expected one of: ${SHEET_SOURCES.map((s) => s.key).join(', ')}` }, { status: 400 })
  }
  const sheetId = parseSheetId(url)
  if (!sheetId) {
    return NextResponse.json({ error: 'Could not find a Google Sheet id in that link — paste the full sheet URL.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('schedule_sources').upsert(
    { source_key: sourceKey, sheet_id: sheetId, sheet_url: url.trim(), updated_at: new Date().toISOString(), updated_by: adminEmail },
    { onConflict: 'source_key' }
  )
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, sourceKey, sheetId })
}
