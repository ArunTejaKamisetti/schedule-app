import { NextRequest, NextResponse } from 'next/server'
import { fetchBothSheetTabsWithFormatting, parseCourseDetails, getDetailAbbr, getArea, isYmhcVenue, cleanCode } from '@/lib/sheets'
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

    // One timestamp for the whole sync: every current row is upserted with it, so any row
    // left with an OLDER timestamp is stale (no longer in the sheet) and gets reconciled away.
    const syncStartedAt = new Date().toISOString()

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
        last_synced_at: syncStartedAt,
      }))

      // Deduplicate by the unique key before upserting — same course/section/day/time
      // across multiple weeks in the sheet should be stored as one record.
      // Enrich each row with full name, faculty, credits, area from Course Details tab
      const enrichedRows = rows.map((r) => {
        const base = getDetailAbbr(r.course_code)
        const detail = detailsMap.get(base)
        return {
          ...r,
          // Keep the admin's venue label (cleaned of the embedded newline) for the
          // YMHC-with-venue cell; everything else uses the full Course-Details name.
          course_name: isYmhcVenue(r.course_code) ? cleanCode(r.course_code) : (detail?.name || r.course_name),
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

      // Reconcile: delete any course row the current sheet no longer produces. The per-slot
      // diff misses these when a cell's CODE changes (e.g. MBGAI → MBGAI (LSM), or a section
      // reshuffle) — the old row isn't a "removal", so it lingered and inflated counts
      // (MBGAI showed 32 vs the real 24). Rows not touched by THIS sync are stale. Guarded by
      // upserts.length > 0 so a transient empty/broken parse can never wipe the table.
      await supabase.from('courses').delete().lt('last_synced_at', syncStartedAt)
    }

    // Persist "what changed" on each changed session for the daily-page highlight. Must be an
    // UPDATE (not a partial upsert — that fails the course_name NOT-NULL on the insert arbiter),
    // run in PARALLEL chunks so even a big change set stays well under the time budget. Only
    // changed rows are touched, so unchanged rows keep their prior highlight.
    const changedRows = diff.upserts.filter((c) => c.change_kind)
    if (changedRows.length > 0) {
      const nowIso = new Date().toISOString()
      const CHUNK = 50
      for (let i = 0; i < changedRows.length; i += CHUNK) {
        await Promise.all(changedRows.slice(i, i + CHUNK).map((c) =>
          supabase.from('courses')
            .update({ change_kind: c.change_kind, change_note: c.change_note ?? null, last_changed_at: nowIso })
            .eq('course_code', c.course_code)
            .eq('sheet_tab', c.sheet_tab)
            .eq('session_date', c.session_date)
            .eq('start_time', c.start_time)
        ))
      }
    }

    // Expire stale change highlights: clear the change_kind/note once it's older than the
    // 3-day UI window, so a real-but-old edit (e.g. a class that moved during early setup)
    // stops showing as "recently changed" forever.
    const changeCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('courses')
      .update({ change_kind: null, change_note: null, last_changed_at: null })
      .lt('last_changed_at', changeCutoff)

    // Save the snapshot NOW — before the (slow, network-bound) notify + calendar steps — so a
    // timeout in the tail can't stall forward progress. Otherwise the diff would never advance
    // and every retry would re-run the heavy Google Calendar sync and time out again.
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
      await supabase.from('sync_log').delete().in('id', logs.slice(5).map((l) => l.id))
    }

    // Best-effort, idempotent side-effects. Notifications are DB-deduped (migration 009) so a
    // re-run never double-sends; the Google Calendar sync is network-heavy, so it runs last
    // and never blocks the snapshot above. Skip on a full baseline (no previous snapshot).
    if (diff.changes.length > 0 && previousSnapshot) {
      await notifyAffectedUsers(diff.changes).catch((e) => console.error('notify failed:', e))

      const { data: connected } = await supabase.from('user_calendar_tokens').select('user_id')
      const connectedIds = (connected ?? []).map((c: { user_id: string }) => c.user_id)
      if (connectedIds.length > 0) {
        // Incremental: only the courses that changed this sync — unaffected users do no work.
        const changedCodes = new Set(diff.changes.map((c) => c.course_code))
        await syncGoogleCalendarForUsers(connectedIds, changedCodes).catch((e) =>
          console.error('Google Calendar sync failed:', e)
        )
      }
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
