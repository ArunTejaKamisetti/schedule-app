import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const params = req.nextUrl.searchParams
  const tab = params.get('tab')
  const from = params.get('from') // YYYY-MM-DD inclusive
  const to = params.get('to')     // YYYY-MM-DD inclusive

  // Catalog: one representative row per course_code (for the picker) — avoids the
  // 1000-row cap missing courses that only appear later in the term.
  if (params.get('catalog')) {
    const { data, error } = await supabase.rpc('course_catalog')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Common events (exams) only — small set, shown to everyone.
  if (params.get('common')) {
    const { data, error } = await supabase
      .from('courses').select('*').eq('is_common', true).order('session_date')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
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
  return NextResponse.json(data)
}
