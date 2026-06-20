'use client'

import { useState } from 'react'

interface UploadResult { ok?: boolean; type?: string; stored?: number; applied?: number; sample?: unknown[]; error?: string }

// Admin-only roster upload. Two separate .xlsx files:
//   • year-1: email → section
//   • year-2: email → elective course codes (must match the schedule sheet codes, e.g. "GT-A")
// The API route (/api/admin/roster) enforces the admin check; this page is just the form.
export default function RosterUploadPage() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Roster upload</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 6 }}>
        Upload the admin roster that assigns each student their schedule. Re-uploading replaces a
        student&apos;s entry. Students who&apos;ve already signed in are updated immediately; others
        are applied when they next sign in.
      </p>

      <UploadCard
        title="1st-year roster (sections)"
        hint="Columns: email, section (A–H / LSM / FIN). One row per student."
        type="year1"
      />
      <UploadCard
        title="2nd-year roster (electives)"
        hint='Columns: email, then the student&apos;s elective codes — one column with comma-separated codes, or several code columns. Codes must match the schedule sheet exactly (e.g. "GT-A", "FC (FIN)").'
        type="year2"
      />
    </main>
  )
}

function UploadCard({ title, hint, type }: { title: string; hint: string; type: 'year1' | 'year2' }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)

  async function upload() {
    if (!file) return
    setBusy(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('type', type)
      fd.append('file', file)
      const res = await fetch('/api/admin/roster', { method: 'POST', body: fd })
      setResult(await res.json())
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Upload failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ marginTop: 24, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
      <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{hint}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={upload}
          disabled={!file || busy}
          style={{
            background: !file || busy ? '#a5b4fc' : '#6366f1', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: !file || busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Uploading…' : 'Upload'}
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
            : `Stored ${result.stored} students · applied to ${result.applied} already-signed-in.\nSample: ${JSON.stringify(result.sample, null, 2)}`}
        </pre>
      )}
    </section>
  )
}
