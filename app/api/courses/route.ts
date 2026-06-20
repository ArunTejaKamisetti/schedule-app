import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Everything this route returns is the SAME schedule for every student (catalog, section
// timetables, common events) — the real egress lever at ~2,400 users. Cache it at the edge:
// the shared read is served from Vercel's CDN, and the DB is hit at most ~once per window per
// distinct URL. The schedule only changes on a sync, so a few minutes of staleness is fine, and
// stale-while-revalidate keeps it instant during a refresh. Per-user data lives in
// /api/courses/user, which is NOT cached.
const SHARED_CACHE = 'public, s-maxage=300, stale-while-revalidate=600'
const cached = (data: unknown) => NextResponse.json(data, { headers: { 'Cache-Control': SHARED_CACHE } })

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const params = req.nextUrl.searchParams
  const tab = params.get('tab')
  const from = params.get('from') // YYYY-MM-DD inclusive
  const to = params.get('to')     // YYYY-MM-DD inclusive

  // Catalog: one representative row per course_code. Default is the 2nd-year picker (RPC filters
  // year = 2); an explicit `year` uses the year-parameterised overload (admin browses either year).
  // Avoids the 1000-row cap missing late-term courses.
  if (params.get('catalog')) {
    const yr = params.get('year')
    const { data, error } = yr
      ? await supabase.rpc('course_catalog', { p_year: Number(yr) })
      : await supabase.rpc('course_catalog')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return cached(data)
  }

  // 1st-year sections that have a timetable loaded (distinct sheet_tab where year = 1).
  if (params.get('year1sections')) {
    const { data, error } = await supabase
      .from('courses').select('sheet_tab').eq('year', 1).eq('is_common', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return cached([...new Set((data ?? []).map((r: { sheet_tab: string }) => r.sheet_tab))].sort())
  }

  // Common events (exams/holidays) — shown to everyone of that year.
  if (params.get('common')) {
    let q = supabase.from('courses').select('*').eq('is_common', true).order('session_date')
    const year = params.get('year')
    if (year) q = q.eq('year', Number(year))
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return cached(data)
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
  return cached(data)
}
