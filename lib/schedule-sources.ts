import { SHEET_SOURCES, type SheetSource } from './sheets-config'
import { createServiceClient } from './supabase/server'

type SB = ReturnType<typeof createServiceClient>

// Merge the admin-pasted sheet ids (`schedule_sources`, migration 019) onto the static source
// registry. A DB id wins; otherwise the source's static fallback id (if any) is used; a source with
// neither ends up with an empty `sheetId` and is skipped by the sync loop. This is what lets a new
// term's sheet come from a pasted link with zero code/env change.
export async function resolveSheetSources(supabase: SB): Promise<SheetSource[]> {
  let byKey = new Map<string, string>()
  try {
    const { data } = await supabase.from('schedule_sources').select('source_key, sheet_id')
    byKey = new Map((data ?? []).map((r: { source_key: string; sheet_id: string }) => [r.source_key, r.sheet_id]))
  } catch {
    // Table missing (pre-migration) — fall back to the static ids only.
  }
  return SHEET_SOURCES.map((s) => ({ ...s, sheetId: byKey.get(s.key) || s.sheetId || '' }))
}
