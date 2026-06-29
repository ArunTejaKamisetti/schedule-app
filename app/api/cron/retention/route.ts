import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { retentionDays, retentionCutoffDate, retentionCutoffIso } from '@/lib/retention'

export const maxDuration = 60

// POST /api/cron/retention — DPDP data minimization. Deletes per-user rows from previous terms:
//   • notes        — by session_date (the class the note is for)
//   • attendance   — by marked_at
//   • notifications— by created_at
// Reference data (courses, bus, mess) and identity are untouched. Window = RETENTION_DAYS days
// (default 180). Schedule weekly via cron-job.org with the CRON_SECRET bearer header.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const days = retentionDays(process.env.RETENTION_DAYS)
  const now = new Date()
  const cutoffDate = retentionCutoffDate(now, days)
  const cutoffIso = retentionCutoffIso(now, days)

  // `count: 'exact'` returns how many rows the delete removed; a delete returns no rows by default
  // (no `.select()`), so nothing is shipped back regardless.
  const purgedNotes = await supabase
    .from('notes').delete({ count: 'exact' }).lt('session_date', cutoffDate)
  const purgedAttendance = await supabase
    .from('attendance').delete({ count: 'exact' }).lt('marked_at', cutoffIso)
  const purgedNotifications = await supabase
    .from('notifications').delete({ count: 'exact' }).lt('created_at', cutoffIso)

  return NextResponse.json({
    ok: true,
    cutoff: cutoffDate,
    retention_days: days,
    purged: {
      notes: purgedNotes.count ?? 0,
      attendance: purgedAttendance.count ?? 0,
      notifications: purgedNotifications.count ?? 0,
    },
  })
}

// Allow GET for a manual admin trigger from the browser.
export async function GET(req: NextRequest) {
  return POST(req)
}
