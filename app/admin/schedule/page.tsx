'use client'

import { useEffect, useState } from 'react'

interface SourceOpt {
  key: string
  year: 1 | 2
  layout: string
  sheetUrl: string | null
  updatedAt: string | null
}

// Admin term-schedule management. Per term the admin pastes the new Google Sheet LINK for each
// source (the app reads it with the stored Google authorization — no env, no per-term code), then
// runs "Sync now" on the dashboard. The /api/admin/** routes enforce the admin check.
export default function ScheduleAdminPage() {
  const [sources, setSources] = useState<SourceOpt[]>([])
  const [googleAuthorized, setGoogleAuthorized] = useState<boolean | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function load() {
    fetch('/api/admin/schedule')
      .then((r) => r.json())
      .then((d: { sources?: SourceOpt[]; googleAuthorized?: boolean }) => {
        const s = d.sources ?? []
        setSources(s)
        setGoogleAuthorized(d.googleAuthorized ?? false)
        setLinks(Object.fromEntries(s.map((x) => [x.key, x.sheetUrl ?? ''])))
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
    </main>
  )
}
