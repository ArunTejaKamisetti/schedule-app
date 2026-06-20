// Pure helpers for the admin dashboard — no DB, so they're unit-tested. The status route does the
// querying and hands rows here.

export interface SyncLogRow {
  source_key: string | null
  status: string | null
  synced_at: string | null
  rows_added: number | null
  rows_modified: number | null
  rows_removed: number | null
  error_message: string | null
}

// Collapse a flat list of sync_log rows to the LATEST row per source_key (by synced_at),
// sorted by source_key for stable display. Tolerant of nulls and any input order.
export function latestSyncPerSource(logs: SyncLogRow[] | null | undefined): SyncLogRow[] {
  const byKey = new Map<string, SyncLogRow>()
  for (const log of logs ?? []) {
    const key = log.source_key ?? 'unknown'
    const cur = byKey.get(key)
    if (!cur || (log.synced_at ?? '') > (cur.synced_at ?? '')) byKey.set(key, log)
  }
  return [...byKey.values()].sort((a, b) => (a.source_key ?? '').localeCompare(b.source_key ?? ''))
}
