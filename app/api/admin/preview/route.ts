import { NextResponse } from 'next/server'
import { fetchBothSheetTabs, parseSheetRows } from '@/lib/sheets'

export async function GET() {
  try {
    const data = await fetchBothSheetTabs()
    const parsed1 = parseSheetRows(data.sheet1, 'Term IV Schedule')
    const parsed2 = parseSheetRows(data.sheet2, 'Course Details')

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
