import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { SHEET_SOURCES } from '@/lib/sheets-config'
import { workbookToSheetData } from '@/lib/xlsx-schedule'
import { ingestSheetData } from '@/lib/sync-core'
import { isSheetAuthorized } from '@/lib/google-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/admin/schedule — the configured sources + each one's current pasted link, and whether an
// admin has authorized Google sheet access. Drives the admin page (paste link / upload / authorize).
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

// POST /api/admin/schedule  (multipart: sourceKey=<SHEET_SOURCES.key>, file=<.xlsx>)
// Parses an uploaded term-schedule workbook and runs it through the SAME ingest as a Google sync
// of that source — diff vs the last snapshot, upsert/reconcile courses, notify, snapshot. So an
// upload is just another input for the source: it shares the source_key, and a later auto-sync of
// the same source (if its Google sheet is configured) would diff against this upload's snapshot.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const form = await req.formData()
  const sourceKey = String(form.get('sourceKey') ?? '')
  const file = form.get('file')
  const source = SHEET_SOURCES.find((s) => s.key === sourceKey)
  if (!source) {
    return NextResponse.json({ error: `Unknown sourceKey. Expected one of: ${SHEET_SOURCES.map((s) => s.key).join(', ')}` }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Provide an .xlsx file' }, { status: 400 })
  }

  let newData
  try {
    newData = await workbookToSheetData(await file.arrayBuffer(), { layout: source.layout, year: source.year })
  } catch {
    return NextResponse.json({ error: 'Could not read that file as .xlsx' }, { status: 400 })
  }
  if (!newData.sheet1.length) {
    return NextResponse.json({ error: 'The schedule tab looks empty — check the workbook has a “…Schedule” sheet.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  try {
    const result = await ingestSheetData(supabase, source, newData)
    return NextResponse.json({ ok: true, source: source.key, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabase.from('sync_log').insert({
      status: 'error', source_key: source.key, error_message: `upload: ${message}`,
      rows_added: 0, rows_modified: 0, rows_removed: 0, raw_snapshot: null,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
