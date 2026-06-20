// DPDP data minimization (Phase 2 / Phase 4): purge per-user rows from previous terms so the DB
// stays well under the 500 MB free-tier ceiling and we retain only what's currently useful.
// Pure date math here — no DB — so it's unit-tested; the cron route applies it.

export const DEFAULT_RETENTION_DAYS = 180 // ~one term + buffer

// Resolve the retention window (days) from an env value, falling back to the default for any
// missing / non-positive / non-numeric input.
export function retentionDays(raw?: string | null): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_RETENTION_DAYS
}

// The cutoff DATE ("YYYY-MM-DD") `days` before `now` (UTC). Rows strictly OLDER than this are
// purgeable; rows on/after it are kept. String-built (no TZ shift), matching the app's date model.
export function retentionCutoffDate(now: Date, days: number): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The cutoff as an ISO timestamp (start of the cutoff day, UTC) for timestamptz columns.
export function retentionCutoffIso(now: Date, days: number): string {
  return `${retentionCutoffDate(now, days)}T00:00:00.000Z`
}
