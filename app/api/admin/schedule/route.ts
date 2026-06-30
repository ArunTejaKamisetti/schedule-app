import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { SHEET_SOURCES } from '@/lib/sheets-config'
import { isSheetAuthorized } from '@/lib/google-auth'

export const runtime = 'nodejs'

// GET /api/admin/schedule — the configured sources + each one's current pasted link, and whether an
// admin has authorized Google sheet access. Drives the admin page (paste link / authorize). The
// schedule itself is pulled from the pasted Google Sheet link via "Sync now" on the dashboard.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const [{ data: rows }, googleAuthorized] = await Promise.all([
    supabase.from('schedule_sources').select('source_key, sheet_url, updated_at'),
    isSheetAuthorized(),
  ])
  type SourceRow = { source_key: string; sheet_url: string | null; updated_at: string | null }
  const byKey = new Map<string, SourceRow>((rows ?? []).map((r: SourceRow) => [r.source_key, r]))
  return NextResponse.json({
    googleAuthorized,
    sources: SHEET_SOURCES.map((s) => ({
      key: s.key,
      year: s.year,
      layout: s.layout,
      sheetUrl: byKey.get(s.key)?.sheet_url ?? null,
      updatedAt: byKey.get(s.key)?.updated_at ?? null,
    })),
  })
}
