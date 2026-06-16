import { NextRequest, NextResponse } from 'next/server'
import { fetchBothSheetTabsWithFormatting, parseCourseDetails, getDetailAbbr, getArea, isYmhcVenue, cleanCode, detailKey } from '@/lib/sheets'
import { SHEET_SOURCES, type SheetSource } from '@/lib/sheets-config'
import { diffSheetData } from '@/lib/diff'
import { notifyAffectedUsers } from '@/lib/notify'
import { syncGoogleCalendarForUsers } from '@/lib/gcal'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 60

type SB = ReturnType<typeof createServiceClient>

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createServiceClient()
  const results: Record<string, unknown>[] = []

  // Each configured sheet (year/section) syncs independently and scoped by source_key, so a
  // broken 1st-year sheet can never break the 2nd-year sync.
  for (const source of SHEET_SOURCES) {
    if (!source.sheetId) continue
    try {
      results.push({ key: source.key, ...(await syncOneSource(supabase, source)) })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await supabase.from('sync_log').insert({
        status: 'error', source_key: source.key, error_message: message,
        rows_added: 0, rows_modified: 0, rows_removed: 0, raw_snapshot: null,
      })
      results.push({ key: source.key, error: message })
    }
  }

  // Expire stale change highlights once, globally (older than the 3-day UI window).
  const changeCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('courses')
    .update({ change_kind: null, change_note: null, last_changed_at: null })
    .lt('last_changed_at', changeCutoff)

  return NextResponse.json({ ok: true, sources: results })
}

async function syncOneSource(supabase: SB, source: SheetSource) {
  const newData = await fetchBothSheetTabsWithFormatting(source)
  const detailsMap = parseCourseDetails(newData.sheet2, source.layout)

  // Per-source baseline snapshot.
  const { data: lastLog } = await supabase
    .from('sync_log').select('raw_snapshot')
    .eq('status', 'success').eq('source_key', source.key)
    .order('synced_at', { ascending: false }).limit(1).maybeSingle()
  const previousSnapshot = lastLog?.raw_snapshot ?? null

  const diff = diffSheetData(previousSnapshot, newData)
  const syncStartedAt = new Date().toISOString()

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

// Allow GET for manual trigger from browser (admin only)
export async function GET(req: NextRequest) {
  return POST(req)
}
