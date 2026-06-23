import { parseCourseDetails, getDetailAbbr, getArea, isYmhcVenue, cleanCode, detailKey, fetchBothSheetTabsWithFormatting } from './sheets'
import type { SheetSource } from './sheets-config'
import { diffSheetData } from './diff'
import { notifyAffectedUsers } from './notify'
import { syncGoogleCalendarForUsers } from './gcal'
import { createServiceClient } from './supabase/server'
import type { RawSheetData } from './types'

type SB = ReturnType<typeof createServiceClient>

// Pull a source's tabs from Google Sheets, then ingest. Used by the scheduled/manual sync.
export async function syncOneSource(supabase: SB, source: SheetSource) {
  const newData = await fetchBothSheetTabsWithFormatting(source)
  return ingestSheetData(supabase, source, newData)
}

// The shared ingest: given already-fetched `RawSheetData` (from Google OR an uploaded .xlsx),
// diff it against the source's last snapshot, upsert/reconcile `courses`, write change highlights,
// save the snapshot, and fire notify/calendar side-effects. This is the single code path for every
// schedule input, so the admin Excel upload behaves exactly like a sync of that source.
export async function ingestSheetData(supabase: SB, source: SheetSource, newData: RawSheetData) {
  const detailsMap = parseCourseDetails(newData.sheet2, source.layout)

  // Per-source baseline snapshot.
  const { data: lastLog } = await supabase
    .from('sync_log').select('raw_snapshot')
    .eq('status', 'success').eq('source_key', source.key)
    .order('synced_at', { ascending: false }).limit(1).maybeSingle()
  const previousSnapshot = lastLog?.raw_snapshot ?? null

  const diff = diffSheetData(previousSnapshot, newData)
  const syncStartedAt = new Date().toISOString()

  // Fast no-op path: once we have a baseline, most runs (especially at a 30-min cadence) find the
  // sheet unchanged. Skip the heavy tail — writing a fresh full raw_snapshot to sync_log, pruning
  // logs, and the notify/calendar work — and just return. The previous snapshot stays the baseline
  // for the next diff. Re-uploading an identical .xlsx is likewise a cheap no-op.
  if (previousSnapshot && diff.upserts.length === 0 && diff.removed.length === 0) {
    return { added: 0, modified: 0, removed: 0, changes: 0, skipped: true }
  }

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
      year: source.year,
      source_key: source.key,
      last_synced_at: syncStartedAt,
    }))

    // Enrich from Course Details. 2nd-year (division) path is unchanged; 1st-year (section)
    // looks up name/credit by abbr and faculty by (abbr, section). Events get no enrichment.
    const enrichedRows = rows.map((r) => {
      if (r.is_common) return { ...r, area: null }
      if (source.layout === 'section') {
        const { primary, fallback } = detailKey(r.course_code, r.sheet_tab, 'section')
        const base = detailsMap.get(fallback)
        const secDetail = detailsMap.get(primary)
        return {
          ...r,
          course_name: base?.name || r.course_name,
          instructor: secDetail?.faculty || base?.faculty || r.instructor || null,
          credits: base?.credits || r.credits || null,
          area: null,
        }
      }
      const detail = detailsMap.get(getDetailAbbr(r.course_code))
      return {
        ...r,
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
      .upsert(dedupedRows, { onConflict: 'course_code,sheet_tab,session_date,start_time', ignoreDuplicates: false })
    if (upsertError) throw new Error(`Upsert failed (${source.key}): ${upsertError.message}`)

    // Reconcile stale rows — scoped to THIS source so it never touches other years.
    await supabase.from('courses').delete().eq('source_key', source.key).lt('last_synced_at', syncStartedAt)
  }

  // Change-highlight metadata (UPDATE, parallel chunks, scoped to this source).
  const changedRows = diff.upserts.filter((c) => c.change_kind)
  if (changedRows.length > 0) {
    const nowIso = new Date().toISOString()
    const CHUNK = 50
    for (let i = 0; i < changedRows.length; i += CHUNK) {
      await Promise.all(changedRows.slice(i, i + CHUNK).map((c) =>
        supabase.from('courses')
          .update({ change_kind: c.change_kind, change_note: c.change_note ?? null, last_changed_at: nowIso })
          .eq('source_key', source.key)
          .eq('course_code', c.course_code).eq('sheet_tab', c.sheet_tab)
          .eq('session_date', c.session_date).eq('start_time', c.start_time)
      ))
    }
  }

  // Save the per-source snapshot BEFORE the slow notify/calendar tail (forward progress).
  await supabase.from('sync_log').insert({
    status: 'success', source_key: source.key,
    rows_added: diff.added.length, rows_modified: diff.upserts.length - diff.added.length,
    rows_removed: diff.removed.length, raw_snapshot: newData,
  })
  const { data: logs } = await supabase
    .from('sync_log').select('id').eq('source_key', source.key).order('synced_at', { ascending: false })
  if (logs && logs.length > 5) {
    await supabase.from('sync_log').delete().in('id', logs.slice(5).map((l: { id: string }) => l.id))
  }

  // Best-effort, idempotent side-effects (skip on a full baseline).
  if (diff.changes.length > 0 && previousSnapshot) {
    await notifyAffectedUsers(diff.changes, source.year).catch((e) => console.error('notify failed:', e))
    const { data: connected } = await supabase.from('user_calendar_tokens').select('user_id')
    const connectedIds = (connected ?? []).map((c: { user_id: string }) => c.user_id)
    if (connectedIds.length > 0) {
      const changedCodes = new Set(diff.changes.map((c) => c.course_code))
      await syncGoogleCalendarForUsers(connectedIds, changedCodes).catch((e) => console.error('Google Calendar sync failed:', e))
    }
  }

  return { added: diff.added.length, modified: diff.upserts.length - diff.added.length, removed: diff.removed.length, changes: diff.changes.length }
}
