import { NextRequest, NextResponse } from 'next/server'
import { fetchBothSheetTabsWithFormatting, parseCourseDetails, getDetailAbbr, getArea } from '@/lib/sheets'
import { diffSheetData } from '@/lib/diff'
import { notifyAffectedUsers } from '@/lib/notify'
import { syncGoogleCalendarForUsers } from '@/lib/gcal'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  try {
    // Fetch latest sheet data (with cell formatting for colour-based cancellation)
    const newData = await fetchBothSheetTabsWithFormatting()

    // Build course details lookup from the Course Details tab
    const detailsMap = parseCourseDetails(newData.sheet2)

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
        session_date: c.session_date || null,
        start_time: c.start_time || null,
        end_time: c.end_time || null,
        room: c.room || null,
        credits: c.credits || null,
        sheet_tab: c.sheet_tab,
        sheet_row_index: c.sheet_row_index,
        is_cancelled: c.is_cancelled ?? false,
        is_common: c.is_common,
        event_kind: c.event_kind,
        last_synced_at: new Date().toISOString(),
      }))

      // Deduplicate by the unique key before upserting — same course/section/day/time
      // across multiple weeks in the sheet should be stored as one record.
      // Enrich each row with full name, faculty, credits, area from Course Details tab
      const enrichedRows = rows.map((r) => {
        const base = getDetailAbbr(r.course_code)
        const detail = detailsMap.get(base)
        return {
          ...r,
          course_name: detail?.name || r.course_name,
          instructor: detail?.faculty || r.instructor || null,
          credits: detail?.credits || r.credits || null,
          area: getArea(r.course_code),
        }
      })

      const seen = new Set<string>()
      const dedupedRows = enrichedRows.filter((r) => {
        const key = `${r.course_code}::${r.sheet_tab}::${r.session_date}::${r.start_time}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const { error: upsertError } = await supabase
        .from('courses')
        .upsert(dedupedRows, {
          onConflict: 'course_code,sheet_tab,session_date,start_time',
          ignoreDuplicates: false,
        })

      if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`)
    }

    // Delete genuinely-removed sessions by their exact slot (NOT by course_code, which
    // would wipe every dated session of that course).
    for (const r of diff.removed) {
      await supabase
        .from('courses')
        .delete()
        .eq('course_code', r.course_code)
        .eq('sheet_tab', r.sheet_tab)
        .eq('session_date', r.session_date)
        .eq('start_time', r.start_time)
    }

    // Persist "what changed" on each changed session for the daily-page highlight.
    // Done as targeted UPDATEs (not in the upsert) so unchanged rows keep their prior
    // change metadata until it naturally ages out of the highlight window.
    const changedRows = diff.upserts.filter((c) => c.change_kind)
    for (const c of changedRows) {
      await supabase
        .from('courses')
        .update({ change_kind: c.change_kind, change_note: c.change_note ?? null, last_changed_at: new Date().toISOString() })
        .eq('course_code', c.course_code)
        .eq('sheet_tab', c.sheet_tab)
        .eq('session_date', c.session_date)
        .eq('start_time', c.start_time)
    }

    // Cancellation state (is_cancelled) is persisted precisely per-row via the upsert
    // above — derived from each cell's colour/strikethrough in the diff.

    // Notify users of changes, then push updated schedules to connected Google Calendars.
    // Skip notifications on a full baseline (no previous snapshot) — otherwise a rebaseline
    // would alert every enrolled user about every session as "new".
    if (diff.changes.length > 0) {
      if (previousSnapshot) await notifyAffectedUsers(diff.changes)

      const { data: connected } = await supabase.from('user_calendar_tokens').select('user_id')
      const connectedIds = (connected ?? []).map((c: { user_id: string }) => c.user_id)
      if (connectedIds.length > 0) {
        await syncGoogleCalendarForUsers(connectedIds).catch((e) =>
          console.error('Google Calendar sync failed:', e)
        )
      }
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
