'use client'

import { useEffect, useState } from 'react'

interface SourceOpt {
  key: string
  year: 1 | 2
  layout: string
  sheetUrl: string | null
  updatedAt: string | null
}
interface UploadResult { ok?: boolean; source?: string; added?: number; modified?: number; removed?: number; changes?: number; error?: string }

// Admin term-schedule management. Per term the admin pastes the new Google Sheet LINK for each
// source (the app reads it with the stored Google authorization — no env, no per-term code). The
// .xlsx upload below stays as an offline fallback. The /api/admin/** routes enforce the admin check.
export default function ScheduleAdminPage() {
  const [sources, setSources] = useState<SourceOpt[]>([])
  const [googleAuthorized, setGoogleAuthorized] = useState<boolean | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // .xlsx upload state
  const [sourceKey, setSourceKey] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)

  function load() {
    fetch('/api/admin/schedule')
      .then((r) => r.json())
      .then((d: { sources?: SourceOpt[]; googleAuthorized?: boolean }) => {
        const s = d.sources ?? []
        setSources(s)
        setGoogleAuthorized(d.googleAuthorized ?? false)
        setLinks(Object.fromEntries(s.map((x) => [x.key, x.sheetUrl ?? ''])))
        if (s[0]) setSourceKey((prev) => prev || s[0].key)
      })
      .catch(() => {})
  }

  useEffect(() => {
    load()
    // Surface the result of the one-time Google authorization redirect (deferred out of the effect
    // body so it doesn't trigger a synchronous cascading render).
    const params = new URLSearchParams(window.location.search)
    const msg =
      params.get('google') === 'connected' ? '✅ Google connected — sheets can now be synced.'
      : params.get('google') === 'error' ? `⚠️ Google authorization failed: ${params.get('reason') ?? 'unknown'}`
      : null
    if (msg) queueMicrotask(() => setNotice(msg))
  }, [])

  async function saveLink(key: string) {
    setSavingKey(key)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/schedule/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceKey: key, url: links[key] ?? '' }),
      })
      const d = await res.json()
      if (!res.ok) setNotice(`⚠️ ${d.error ?? 'Could not save link'}`)
      else { setNotice(`✅ Saved link for ${key}. Click “Sync now” on the dashboard to pull it.`); load() }
    } catch (e) {
      setNotice(`⚠️ ${e instanceof Error ? e.message : 'Save failed'}`)
    } finally {
      setSavingKey(null)
    }
  }

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

  const label = (s: SourceOpt) => `${s.key} · ${s.year === 1 ? '1st' : '2nd'} year · ${s.layout}`

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Term schedule</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 6 }}>
        Each term, paste the new Google Sheet link for each source below, then run <b>Sync now</b> on
        the dashboard. No keys or code changes needed.
      </p>

      {notice && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, fontSize: 14, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>{notice}</div>
      )}

      {/* Google authorization status */}
      <section style={{ marginTop: 20, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Google access</div>
        {googleAuthorized === null ? (
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Checking…</span>
        ) : googleAuthorized ? (
          <span style={{ color: '#15803d', fontSize: 14 }}>✅ Connected. <a href="/api/admin/oauth" style={{ color: '#4f46e5' }}>Re-authorize</a> if sync starts failing.</span>
        ) : (
          <span style={{ color: '#b45309', fontSize: 14 }}>
            ⚠️ Not connected. <a href="/api/admin/oauth" style={{ color: '#4f46e5', fontWeight: 600 }}>Authorize Google</a> once to let the app read your sheets.
          </span>
        )}
      </section>

      {/* Per-source link paste */}
      <section style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Sheet links</div>
        {sources.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>No sources configured.</p>}
        {sources.map((s) => (
          <div key={s.key} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label(s)}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={links[s.key] ?? ''}
                onChange={(e) => setLinks((m) => ({ ...m, [s.key]: e.target.value }))}
                style={{ flex: 1, minWidth: 260, padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
              />
              <button
                onClick={() => saveLink(s.key)}
                disabled={savingKey === s.key}
                style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}
              >
                {savingKey === s.key ? 'Saving…' : 'Save link'}
              </button>
            </div>
            {s.updatedAt && <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Last updated {new Date(s.updatedAt).toLocaleString()}</p>}
          </div>
        ))}
      </section>

      {/* .xlsx upload fallback */}
      <section style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Or upload an .xlsx (offline fallback)</div>
        <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
          A workbook with a <b>“…Schedule”</b> tab + a <b>“Course Details”</b> tab. Cell colours
          (red = cancelled, green = added) and merged event banners are read.
        </p>
        <select
          value={sourceKey}
          onChange={(e) => setSourceKey(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, marginTop: 10 }}
        >
          {sources.length === 0 && <option value="">No sources configured</option>}
          {sources.map((s) => <option key={s.key} value={s.key}>{label(s)}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
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
    </main>
  )
}
