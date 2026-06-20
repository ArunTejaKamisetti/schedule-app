import { NextRequest, NextResponse } from 'next/server'
import { SHEET_SOURCES } from '@/lib/sheets-config'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { syncOneSource } from '@/lib/sync-core'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  // Cron uses the CRON_SECRET bearer; a signed-in admin can also trigger it from the UI/browser.
  const cronOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk && !(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createServiceClient()
  const results: Record<string, unknown>[] = []

  // Each configured sheet (year/section) syncs independently and scoped by source_key, so a
  // broken 1st-year sheet can never break the 2nd-year sync.
  for (const source of SHEET_SOURCES) {
    if (!source.sheetId) continue
    try {
      results.push({ key: source.key, ...(await syncOneSource(supabase, source)) })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await supabase.from('sync_log').insert({
        status: 'error', source_key: source.key, error_message: message,
        rows_added: 0, rows_modified: 0, rows_removed: 0, raw_snapshot: null,
      })
      results.push({ key: source.key, error: message })
    }
  }

  // Expire stale change highlights once, globally (older than the 3-day UI window).
  const changeCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('courses')
    .update({ change_kind: null, change_note: null, last_changed_at: null })
    .lt('last_changed_at', changeCutoff)

  return NextResponse.json({ ok: true, sources: results })
}

// Allow GET for manual trigger from browser (admin only)
export async function GET(req: NextRequest) {
  return POST(req)
}
