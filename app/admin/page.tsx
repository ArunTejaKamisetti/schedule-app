'use client'

import { useEffect, useState } from 'react'
import { INSTITUTION_SHORT_NAME } from '@/lib/branding'

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
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{INSTITUTION_SHORT_NAME} Dashboard</h1>
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

          <ReconcilePanels />

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

interface Reconcile {
  count: number
  sample: { email: string | null; display_name: string | null }[]
  rosterY1: number
  rosterY2: number
  warning: string | null
  invalid: { count: number; sample: { id: string; display_name: string | null }[] }
  error?: string
}

// Reconcile panels — both fed by one /api/admin/reconcile fetch:
//   • "Students who have left" — anyone not in the current Y1 or Y2 roster. The remove button is
//     DISABLED until BOTH rosters are uploaded, so a partial upload can't wipe the other year.
//   • "Invalid accounts" — email-less junk the roster prune can never reach (migration 022).
// Each is a preview + explicit confirm + hard delete (cascade clears the user's data).
function ReconcilePanels() {
  const [data, setData] = useState<Reconcile | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/admin/reconcile').then((r) => r.json()).then((d: Reconcile) => { if (active) setData(d) }).catch(() => {})
    return () => { active = false }
  }, [])

  async function reload() {
    try { setData(await (await fetch('/api/admin/reconcile')).json()) } catch {}
  }

  return (
    <>
      <DepartedCard data={data} reload={reload} />
      {data && !data.error && data.invalid.count > 0 && <InvalidCard data={data} reload={reload} />}
    </>
  )
}

function DepartedCard({ data, reload }: { data: Reconcile | null; reload: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch('/api/admin/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }),
      })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? `Removed ${j.removed} student(s).` : (j.error ?? `Failed (${r.status})`))
      setConfirming(false)
      await reload()
    } catch {
      setMsg('Request failed — is the dev server running?')
    } finally {
      setBusy(false)
    }
  }

  const extra = data ? data.count - data.sample.length : 0
  // The whole point of the prune is unsafe with a partial upload — gate the action on BOTH rosters.
  const bothRosters = !!data && data.rosterY1 > 0 && data.rosterY2 > 0

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Students who have left</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 10 }}>
        Anyone not in the current 1st- or 2nd-year roster. Upload <b>both</b> rosters first, then remove.
      </p>
      {!data ? (
        <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
      ) : data.error ? (
        <p style={{ color: '#b91c1c', fontSize: 14 }}>{data.error}</p>
      ) : (
        <>
          {data.warning && (
            <p style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 10 }}>
              ⚠ {data.warning}
            </p>
          )}
          {data.count === 0 ? (
            <p style={{ color: '#15803d', fontSize: 14 }}>Roster is up to date — no students to remove.</p>
          ) : (
            <>
              <p style={{ fontSize: 14, marginBottom: 6 }}>{data.count} student(s) are no longer in any roster:</p>
              <ul style={{ fontSize: 13, color: '#334155', margin: '0 0 10px 18px' }}>
                {data.sample.map((s, i) => (
                  <li key={s.email ?? i}>{s.display_name || s.email || '(no name)'} · {s.email}</li>
                ))}
                {extra > 0 && <li style={{ color: '#64748b' }}>…and {extra} more</li>}
              </ul>
              {!bothRosters ? (
                <p style={{ fontSize: 13, color: '#92400e' }}>
                  Upload both the 1st- and 2nd-year rosters to enable removal
                  {' '}(Y1 {data.rosterY1} · Y2 {data.rosterY2}).
                </p>
              ) : !confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Review &amp; remove ({data.count})
                </button>
              ) : (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
                  <p style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 10 }}>
                    Permanently remove {data.count} student(s) and all their data (friends, attendance, notes)? This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={remove}
                      disabled={busy}
                      style={{ background: busy ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
                    >
                      {busy ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                      style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {msg && <p style={{ fontSize: 13, color: msg.startsWith('Removed') ? '#15803d' : '#b91c1c', marginTop: 10 }}>{msg}</p>}
        </>
      )}
    </Card>
  )
}

// Email-less, non-admin accounts — leftover test/seed junk the roster prune can never match. Shown
// only when some exist; removal is independent of the rosters (no both-rosters gate needed).
function InvalidCard({ data, reload }: { data: Reconcile; reload: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch('/api/admin/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true, target: 'invalid' }),
      })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? `Removed ${j.removed} account(s).` : (j.error ?? `Failed (${r.status})`))
      setConfirming(false)
      await reload()
    } catch {
      setMsg('Request failed — is the dev server running?')
    } finally {
      setBusy(false)
    }
  }

  const { count, sample } = data.invalid
  const extra = count - sample.length

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Invalid accounts</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 10 }}>
        Accounts with no email — leftover test data the roster can never match. Safe to remove.
      </p>
      <p style={{ fontSize: 14, marginBottom: 6 }}>{count} account(s) have no email:</p>
      <ul style={{ fontSize: 13, color: '#334155', margin: '0 0 10px 18px' }}>
        {sample.map((s) => (
          <li key={s.id}>{s.display_name || '(no name)'} · <code>{s.id.slice(0, 8)}</code></li>
        ))}
        {extra > 0 && <li style={{ color: '#64748b' }}>…and {extra} more</li>}
      </ul>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}
        >
          Review &amp; remove ({count})
        </button>
      ) : (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
          <p style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 10 }}>
            Permanently remove {count} email-less account(s) and all their data? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={remove}
              disabled={busy}
              style={{ background: busy ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
            >
              {busy ? 'Removing…' : 'Yes, remove'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p style={{ fontSize: 13, color: msg.startsWith('Removed') ? '#15803d' : '#b91c1c', marginTop: 10 }}>{msg}</p>}
    </Card>
  )
}
