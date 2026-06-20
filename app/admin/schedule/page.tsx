'use client'

import { useEffect, useState } from 'react'

interface SourceOpt { key: string; year: 1 | 2; layout: string }
interface UploadResult { ok?: boolean; source?: string; added?: number; modified?: number; removed?: number; changes?: number; error?: string }

// Admin-only term-schedule upload. Pick the source (year/section) and upload its .xlsx workbook
// (a "…Schedule" tab + a "Course Details" tab, like the Google Sheet). The API runs it through the
// same ingest as a sync, so cell colours (red=cancelled, green=added) and merged event banners are
// honoured. The /api/admin/schedule route enforces the admin check; this page is just the form.
export default function ScheduleUploadPage() {
  const [sources, setSources] = useState<SourceOpt[]>([])
  const [sourceKey, setSourceKey] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)

  useEffect(() => {
    fetch('/api/admin/schedule')
      .then((r) => r.json())
      .then((d: { sources?: SourceOpt[] }) => {
        const s = d.sources ?? []
        setSources(s)
        if (s[0]) setSourceKey(s[0].key)
      })
      .catch(() => {})
  }, [])

  async function upload() {
    if (!file || !sourceKey) return
    setBusy(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('sourceKey', sourceKey)
      fd.append('file', file)
      const res = await fetch('/api/admin/schedule', { method: 'POST', body: fd })
      setResult(await res.json())
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Upload failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Term schedule upload</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 6 }}>
        Upload a term-schedule workbook (.xlsx) for a source. It must contain a <b>“…Schedule”</b>
        {' '}tab and a <b>“Course Details”</b> tab, matching the existing Google Sheet layout. Cell
        colours (red = cancelled, green = added) and merged event banners are read. Re-uploading
        replaces that source&apos;s sessions (changed rows notify affected students).
      </p>

      <section style={{ marginTop: 24, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Source</label>
        <select
          value={sourceKey}
          onChange={(e) => setSourceKey(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
        >
          {sources.length === 0 && <option value="">No sources configured</option>}
          {sources.map((s) => (
            <option key={s.key} value={s.key}>{s.key} · {s.year === 1 ? '1st' : '2nd'} year · {s.layout}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={upload}
            disabled={!file || !sourceKey || busy}
            style={{
              background: !file || !sourceKey || busy ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: !file || !sourceKey || busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Uploading…' : 'Upload & sync'}
          </button>
        </div>

        {result && (
          <pre style={{
            marginTop: 12, background: result.error ? '#fef2f2' : '#f0fdf4', color: '#111',
            border: `1px solid ${result.error ? '#fecaca' : '#bbf7d0'}`, borderRadius: 8, padding: 12,
            fontSize: 12, whiteSpace: 'pre-wrap', overflowX: 'auto',
          }}>
            {result.error
              ? `Error: ${result.error}`
              : `Synced ${result.source}: +${result.added} added · ~${result.modified} modified · −${result.removed} removed · ${result.changes} change notifications.`}
          </pre>
        )}
      </section>

      <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 16 }}>
        Note: if this source also has a Google sheet configured, the scheduled auto-sync will keep
        running against it. Upload here when the schedule is maintained as an Excel file instead.
      </p>
    </main>
  )
}
