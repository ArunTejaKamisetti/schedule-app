import { describe, it, expect } from 'vitest'
import { latestSyncPerSource, type SyncLogRow } from '@/lib/admin-status'

const row = (p: Partial<SyncLogRow>): SyncLogRow => ({
  source_key: null, status: 'success', synced_at: null,
  rows_added: 0, rows_modified: 0, rows_removed: 0, error_message: null, ...p,
})

describe('latestSyncPerSource', () => {
  it('keeps only the newest row per source_key', () => {
    const logs = [
      row({ source_key: 'y2', synced_at: '2026-06-20T10:00:00Z', status: 'success' }),
      row({ source_key: 'y2', synced_at: '2026-06-20T09:00:00Z', status: 'error' }),
      row({ source_key: 'y1-AH', synced_at: '2026-06-19T08:00:00Z' }),
    ]
    const out = latestSyncPerSource(logs)
    expect(out.map((r) => r.source_key)).toEqual(['y1-AH', 'y2']) // sorted by source_key
    expect(out.find((r) => r.source_key === 'y2')!.synced_at).toBe('2026-06-20T10:00:00Z')
  })

  it('is order-independent', () => {
    const logs = [
      row({ source_key: 'y2', synced_at: '2026-06-20T09:00:00Z' }),
      row({ source_key: 'y2', synced_at: '2026-06-20T11:00:00Z' }),
    ]
    expect(latestSyncPerSource(logs)[0].synced_at).toBe('2026-06-20T11:00:00Z')
  })

  it('buckets null source_key under "unknown" and tolerates empty/null input', () => {
    expect(latestSyncPerSource([row({ source_key: null, synced_at: '2026-01-01T00:00:00Z' })])[0].source_key).toBe(null)
    expect(latestSyncPerSource([])).toEqual([])
    expect(latestSyncPerSource(null)).toEqual([])
  })
})
