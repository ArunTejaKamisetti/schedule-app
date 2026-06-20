'use client'

import { useEffect, useState } from 'react'

interface Sync {
  source_key: string | null
  status: string | null
  synced_at: string | null
  rows_added: number | null
  rows_modified: number | null
  rows_removed: number | null
  error_message: string | null
}
interface Status {
  courses: { total: number; year1: number; year2: number }
  users: number
  enrollments: number
  roster: { year1: number; year2: number }
  syncs: Sync[]
  error?: string
}

export default function AdminDashboard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Initial load — setState only in async callbacks (not synchronously in the effect body).
  useEffect(() => {
    let active = true
    fetch('/api/admin/status')
      .then((r) => r.json())
      .then((d: Status) => { if (active) { setStatus(d); setLoading(false) } })
      .catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function reload() {
    try { setStatus(await (await fetch('/api/admin/status')).json()) } catch {}
  }

  async function syncNow() {
    setSyncing(true)
    setMsg(null)
    try {
      const r = await fetch('/api/sync', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? 'Sync complete — schedule refreshed.' : (j.error ?? `Sync failed (${r.status})`))
      await reload()
    } catch {
      setMsg('Sync failed — is the dev server running?')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        Schedule, roster, and student status at a glance.
      </p>

      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : !status || status.error ? (
        <Card>
          <p style={{ color: '#b91c1c' }}>{status?.error ?? 'Could not load status.'}</p>
        </Card>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Stat label="Courses (sessions)" value={status.courses.total} sub={`Y1 ${status.courses.year1} · Y2 ${status.courses.year2}`} />
            <Stat label="Students" value={status.users} />
            <Stat label="Enrollments" value={status.enrollments} />
            <Stat label="Roster" value={status.roster.year1 + status.roster.year2} sub={`Y1 ${status.roster.year1} · Y2 ${status.roster.year2}`} />
          </div>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Schedule sync</h2>
              <button
                onClick={syncNow}
                disabled={syncing}
                style={{
                  background: syncing ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: syncing ? 'default' : 'pointer',
                }}
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
            {msg && <p style={{ fontSize: 13, color: msg.startsWith('Sync complete') ? '#15803d' : '#b91c1c', marginBottom: 10 }}>{msg}</p>}
            {status.syncs.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 14 }}>No syncs yet. Click <b>Sync now</b> to pull the schedule from the sheets.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b' }}>
                    <th style={th}>Source</th><th style={th}>Status</th><th style={th}>When</th><th style={th}>+ / ~ / −</th>
                  </tr>
                </thead>
                <tbody>
                  {status.syncs.map((s) => (
                    <tr key={s.source_key ?? 'unknown'} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={td}><code>{s.source_key ?? '—'}</code></td>
                      <td style={{ ...td, color: s.status === 'success' ? '#15803d' : '#b91c1c' }}>
                        {s.status ?? '—'}{s.error_message ? ` · ${s.error_message}` : ''}
                      </td>
                      <td style={td}>{s.synced_at ? new Date(s.synced_at).toLocaleString() : '—'}</td>
                      <td style={td}>{s.rows_added ?? 0} / {s.rows_modified ?? 0} / {s.rows_removed ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Roster</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 10 }}>
              Each student&apos;s section / electives. Upload replaces a student&apos;s entry.
            </p>
            <a href="/admin/roster" style={{ color: '#4f46e5', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Upload rosters →</a>
          </Card>

          <Card>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Term schedule</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 10 }}>
              Upload a term-schedule workbook (.xlsx) for a source — parsed and synced like the Google sheet (colours + merges honoured).
            </p>
            <a href="/admin/schedule" style={{ color: '#4f46e5', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Upload term schedule →</a>
          </Card>
        </>
      )}
    </main>
  )
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '6px 8px' }

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      {children}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
      <p style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value.toLocaleString()}</p>
      <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</p>}
    </div>
  )
}
