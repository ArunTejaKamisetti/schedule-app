import { NextRequest, NextResponse } from 'next/server'
import { fetchBothSheetTabs } from '@/lib/sheets'
import { diffSheetData } from '@/lib/diff'
import { notifyAffectedUsers } from '@/lib/notify'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  try {
    // Fetch latest sheet data
    const newData = await fetchBothSheetTabs()

    // Get last snapshot from sync log
    const { data: lastLog } = await supabase
      .from('sync_log')
      .select('raw_snapshot')
      .eq('status', 'success')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single()

    const previousSnapshot = lastLog?.raw_snapshot ?? null

    // Compute diff
    const diff = diffSheetData(previousSnapshot, newData)

    // Upsert courses into DB
    if (diff.upserts.length > 0) {
      const rows = diff.upserts.map((c) => ({
        course_code: c.course_code,
        course_name: c.course_name,
        instructor: c.instructor || null,
        day_of_week: c.day_of_week || null,
        start_time: c.start_time || null,
        end_time: c.end_time || null,
        room: c.room || null,
        credits: c.credits || null,
        sheet_tab: c.sheet_tab,
        sheet_row_index: c.sheet_row_index,
        is_cancelled: false,
        last_synced_at: new Date().toISOString(),
      }))

      await supabase
        .from('courses')
        .upsert(rows, {
          onConflict: 'course_code,sheet_tab,day_of_week,start_time',
          ignoreDuplicates: false,
        })
    }

    // Mark removed/cancelled courses
    if (diff.removed.length > 0) {
      const removedKeys = diff.removed.map((c) => c.course_code)
      await supabase
        .from('courses')
        .delete()
        .in('course_code', removedKeys)
    }

    // Handle explicit cancellations (changes of type 'cancelled')
    const cancelled = diff.changes.filter((c) => c.type === 'cancelled')
    if (cancelled.length > 0) {
      const codes = cancelled.map((c) => c.course_code)
      await supabase
        .from('courses')
        .update({ is_cancelled: true })
        .in('course_code', codes)
    }

    // Notify users of changes
    if (diff.changes.length > 0) {
      await notifyAffectedUsers(diff.changes)
    }

    // Save snapshot to sync_log
    await supabase.from('sync_log').insert({
      status: 'success',
      rows_added: diff.added.length,
      rows_modified: diff.upserts.length - diff.added.length,
      rows_removed: diff.removed.length,
      raw_snapshot: newData,
    })

    // Keep only last 5 sync logs
    const { data: logs } = await supabase
      .from('sync_log')
      .select('id')
      .order('synced_at', { ascending: false })

    if (logs && logs.length > 5) {
      const toDelete = logs.slice(5).map((l) => l.id)
      await supabase.from('sync_log').delete().in('id', toDelete)
    }

    return NextResponse.json({
      ok: true,
      added: diff.added.length,
      modified: diff.upserts.length - diff.added.length,
      removed: diff.removed.length,
      changes: diff.changes.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase.from('sync_log').insert({
      status: 'error',
      rows_added: 0,
      rows_modified: 0,
      rows_removed: 0,
      error_message: message,
      raw_snapshot: null,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Allow GET for manual trigger from browser (admin only)
export async function GET(req: NextRequest) {
  return POST(req)
}
