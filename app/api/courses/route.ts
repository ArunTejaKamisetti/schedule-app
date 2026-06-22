import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cacheHeaders } from '@/lib/cache'

// Every variant of this route returns data that is identical for all users (the catalog, common
// events for a year, a section's timetable, a date window) and only changes when the sheet sync
// runs. So all success responses carry a shared CDN cache header: on a hit Vercel serves from the
// edge and the function never runs — which is what keeps Fluid Active CPU usage flat. See
// lib/cache.ts. Errors are returned without the header so failures aren't cached.
export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const params = req.nextUrl.searchParams
  const tab = params.get('tab')
  const from = params.get('from') // YYYY-MM-DD inclusive
  const to = params.get('to')     // YYYY-MM-DD inclusive

  // Catalog: one representative row per course_code (2nd-year elective picker only — the RPC
  // filters year = 2). Avoids the 1000-row cap missing late-term courses.
  if (params.get('catalog')) {
    const { data, error } = await supabase.rpc('course_catalog')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { headers: cacheHeaders() })
  }

  // 1st-year sections that have a timetable loaded (distinct sheet_tab where year = 1).
  if (params.get('year1sections')) {
    const { data, error } = await supabase
      .from('courses').select('sheet_tab').eq('year', 1).eq('is_common', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(
      [...new Set((data ?? []).map((r: { sheet_tab: string }) => r.sheet_tab))].sort(),
      { headers: cacheHeaders() }
    )
  }

  // Common events (exams/holidays) — shown to everyone of that year.
  if (params.get('common')) {
    let q = supabase.from('courses').select('*').eq('is_common', true).order('session_date')
    const year = params.get('year')
    if (year) q = q.eq('year', Number(year))
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { headers: cacheHeaders() })
  }

  let query = supabase
    .from('courses')
    .select('*')
    .order('session_date')
    .order('start_time')

  if (tab) query = query.eq('sheet_tab', tab)
  if (from) query = query.gte('session_date', from)
  if (to) query = query.lte('session_date', to)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { headers: cacheHeaders() })
}
