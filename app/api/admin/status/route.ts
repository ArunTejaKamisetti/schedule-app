import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { latestSyncPerSource, type SyncLogRow } from '@/lib/admin-status'

// GET /api/admin/status — dashboard summary (admin only): row counts + the latest sync per source.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const count = (q: { count: number | null }) => q.count ?? 0
  const head = { count: 'exact' as const, head: true }

  const [courses, y1, y2, users, rosterY1, rosterY2, enrollments, logs] = await Promise.all([
    supabase.from('courses').select('*', head),
    supabase.from('courses').select('*', head).eq('year', 1),
    supabase.from('courses').select('*', head).eq('year', 2),
    supabase.from('users').select('*', head),
    supabase.from('roster').select('*', head).eq('year', 1),
    supabase.from('roster').select('*', head).eq('year', 2),
    supabase.from('enrollments').select('*', head),
    supabase
      .from('sync_log')
      .select('source_key,status,synced_at,rows_added,rows_modified,rows_removed,error_message')
      .order('synced_at', { ascending: false })
      .limit(40),
  ])

  return NextResponse.json({
    courses: { total: count(courses), year1: count(y1), year2: count(y2) },
    users: count(users),
    enrollments: count(enrollments),
    roster: { year1: count(rosterY1), year2: count(rosterY2) },
    syncs: latestSyncPerSource((logs.data ?? []) as SyncLogRow[]),
  })
}
