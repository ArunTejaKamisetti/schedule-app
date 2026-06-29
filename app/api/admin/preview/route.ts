import { NextResponse } from 'next/server'
import { fetchBothSheetTabsWithFormatting, parseSheetRows } from '@/lib/sheets'
import { requireAdmin } from '@/lib/admin'
import { resolveSheetSources } from '@/lib/schedule-sources'
import { loadInstitutionProfile } from '@/lib/institution-profile'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  try {
    const sources = await resolveSheetSources(createServiceClient())
    const source = sources.find((s) => s.sheetId)
    if (!source) {
      return NextResponse.json({ error: 'No schedule source configured — paste a Google Sheet link in Admin → Schedule.' }, { status: 400 })
    }
    const data = await fetchBothSheetTabsWithFormatting(source)
    // Parse with the SAME admin-configured profile the real sync uses, so the preview matches ingest.
    const profile = await loadInstitutionProfile(createServiceClient())
    const parsed1 = parseSheetRows(data.sheet1, { layout: source.layout, format: data.sheet1_format, merges: data.merges, profile })
    const parsed2 = parseSheetRows(data.sheet2, { profile })

    return NextResponse.json({
      fetched_at: data.fetched_at,
      sheet1: {
        headers: data.sheet1[0] ?? [],
        sample: data.sheet1.slice(0, 6),
        parsed_count: parsed1.length,
        parsed_sample: parsed1.slice(0, 3),
      },
      sheet2: {
        headers: data.sheet2[0] ?? [],
        sample: data.sheet2.slice(0, 6),
        parsed_count: parsed2.length,
        parsed_sample: parsed2.slice(0, 3),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
