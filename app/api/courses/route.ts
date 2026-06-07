import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const tab = req.nextUrl.searchParams.get('tab')

  let query = supabase
    .from('courses')
    .select('*')
    .order('sheet_tab')
    .order('day_of_week')
    .order('start_time')

  if (tab) query = query.eq('sheet_tab', tab)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
