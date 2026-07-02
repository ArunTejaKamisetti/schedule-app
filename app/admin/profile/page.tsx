'use client'

import { useEffect, useState } from 'react'
import {
  classifyBySwatches, type InstitutionProfile, type ColorRules, type CatalogConfig,
  type SectionConfig, type KeywordConfig,
} from '@/lib/institution-profile'

type Tab = 'colors' | 'catalog' | 'sections'

// Institution Profile — the per-deployment vocabulary of change-tracking (colours, catalog, sections,
// keywords). The change-tracking LOGIC is generic; this is only what differs between
// institutions. Defaults = IIM-K; an admin edits any concern here with NO redeploy. Colours first.
export default function InstitutionProfilePage() {
  const [profile, setProfile] = useState<InstitutionProfile | null>(null)
  const [tab, setTab] = useState<Tab>('colors')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/profile')
      .then((r) => r.json())
      .then((d: { profile?: InstitutionProfile }) => { if (d.profile) setProfile(d.profile) })
      .catch(() => setNotice('⚠️ Could not load the profile.'))
  }, [])

  async function save(patch: Partial<InstitutionProfile>) {
    setNotice(null)
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const d = await res.json()
      if (!res.ok) { setNotice(`⚠️ ${d.error ?? 'Save failed'}`); return }
      if (d.profile) setProfile(d.profile)
      setNotice('✅ Saved. The next schedule sync will use these settings.')
    } catch (e) {
      setNotice(`⚠️ ${e instanceof Error ? e.message : 'Save failed'}`)
    }
  }

  const patch = (over: Partial<InstitutionProfile>) => profile && setProfile({ ...profile, ...over })

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Institution Profile</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 6 }}>
        How this deployment reads schedule changes. The change <b>rules</b> (cancelled / rescheduled /
        room move / added / removed) are automatic; here you configure the <b>vocabulary</b> your
        sheets use. Defaults match IIM-K — change them for a different institution. No redeploy needed.
      </p>

      {notice && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, fontSize: 14, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>{notice}</div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 20, flexWrap: 'wrap', borderBottom: '1px solid #e5e7eb' }}>
        {(['colors', 'catalog', 'sections'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: tab === t ? 700 : 500, color: tab === t ? '#4f46e5' : '#64748b',
              borderBottom: tab === t ? '2px solid #4f46e5' : '2px solid transparent', marginBottom: -1,
            }}
          >
            {t === 'colors' ? 'Colours' : t === 'catalog' ? 'Catalog' : 'Sections'}
          </button>
        ))}
      </div>

      {!profile ? (
        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 24 }}>Loading…</p>
      ) : (
        <div style={{ marginTop: 20 }}>
          {tab === 'colors' && <ColorsTab value={profile.colors} onChange={(colors) => patch({ colors })} onSave={() => save({ colors: profile.colors })} />}
          {tab === 'catalog' && <CatalogTab value={profile.catalog} onChange={(catalog) => patch({ catalog })} onSave={() => save({ catalog: profile.catalog })} />}
          {tab === 'sections' && (
            <SectionsTab
              sections={profile.sections} keywords={profile.keywords}
              onChange={(sections, keywords) => patch({ sections, keywords })}
              onSave={() => save({ sections: profile.sections, keywords: profile.keywords })}
            />
          )}
        </div>
      )}
    </main>
  )
}

// ── shared bits ──────────────────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }
const inputStyle: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }
const saveBtn: React.CSSProperties = { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', marginTop: 4 }
const smallBtn: React.CSSProperties = { background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }
const delBtn: React.CSSProperties = { ...smallBtn, color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }
const hint: React.CSSProperties = { color: '#94a3b8', fontSize: 12, marginTop: 6 }

function SaveBar({ onSave }: { onSave: () => void }) {
  return <button onClick={onSave} style={saveBtn}>Save</button>
}

// ── Colours tab ────────────────────────────────────────────────────────────────────────────────

function ColorsTab({ value, onChange, onSave }: { value: ColorRules; onChange: (v: ColorRules) => void; onSave: () => void }) {
  const [test, setTest] = useState('#f4cccc')
  const buckets: [keyof Pick<ColorRules, 'cancelled' | 'added' | 'event'>, string][] = [
    ['cancelled', 'Cancelled'], ['added', 'Added / new'], ['event', 'Event / holiday / exam'],
  ]
  const testResult = value.mode === 'custom'
    ? classifyBySwatches(test, value)
    : '(switch to custom mode to test against your swatches)'
  const stateLabel: Record<string, string> = { red: 'Cancelled', green: 'Added', event: 'Event', normal: 'No highlight' }

  return (
    <>
      <div style={card}>
        <span style={labelStyle}>Detection mode</span>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
          <input type="radio" checked={value.mode === 'auto'} onChange={() => onChange({ ...value, mode: 'auto' })} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 13 }}>
            <b>Automatic (recommended)</b> — detects any shade of <span style={{ color: '#dc2626' }}>red = cancelled</span>,
            {' '}<span style={{ color: '#16a34a' }}>green = added</span>, <span style={{ color: '#d97706' }}>amber = event</span>.
            Works for IIM-K and any institution using the same convention. No swatches to configure.
          </span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="radio" checked={value.mode === 'custom'} onChange={() => onChange({ ...value, mode: 'custom' })} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 13 }}>
            <b>Custom swatches</b> — for a different colour convention. Declare the exact fill colours your
            coordinators use for each meaning; a cell is matched to the nearest swatch within the tolerance below.
          </span>
        </label>
      </div>

      {value.mode === 'custom' && (
        <>
          {buckets.map(([key, title]) => (
            <div key={key} style={card}>
              <span style={labelStyle}>{title}</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {value[key].map((hex, i) => (
                  <span key={i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '3px 6px' }}>
                    <input
                      type="color" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff'}
                      onChange={(e) => { const next = [...value[key]]; next[i] = e.target.value; onChange({ ...value, [key]: next }) }}
                      style={{ width: 28, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                    />
                    <code style={{ fontSize: 12 }}>{hex}</code>
                    <button onClick={() => onChange({ ...value, [key]: value[key].filter((_, j) => j !== i) })} style={{ ...delBtn, padding: '0 6px' }}>×</button>
                  </span>
                ))}
                <button onClick={() => onChange({ ...value, [key]: [...value[key], '#ff0000'] })} style={smallBtn}>+ Add colour</button>
              </div>
            </div>
          ))}

          <div style={card}>
            <span style={labelStyle}>Match tolerance — {value.tolerance.toFixed(2)}</span>
            <input
              type="range" min={0.05} max={0.6} step={0.01} value={value.tolerance}
              onChange={(e) => onChange({ ...value, tolerance: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p style={hint}>Lower = stricter (only near-exact matches). Higher = more forgiving of shade differences. Start around 0.25.</p>
          </div>

          <div style={card}>
            <span style={labelStyle}>Test a colour</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="color" value={test} onChange={(e) => setTest(e.target.value)} style={{ width: 36, height: 36, border: 'none', cursor: 'pointer' }} />
              <code style={{ fontSize: 12 }}>{test}</code>
              <span style={{ fontSize: 13 }}>→ <b>{stateLabel[testResult as string] ?? String(testResult)}</b></span>
            </div>
          </div>
        </>
      )}

      <SaveBar onSave={onSave} />
    </>
  )
}

// ── Catalog tab ────────────────────────────────────────────────────────────────────────────────

function CatalogTab({ value, onChange, onSave }: { value: CatalogConfig; onChange: (v: CatalogConfig) => void; onSave: () => void }) {
  return (
    <>
      <div style={card}>
        <span style={labelStyle}>Course aliases — schedule code → roster / Course-Details code</span>
        <p style={hint}>
          When the same course is written differently in the schedule vs the roster (or Course Details).
          Matching ignores case and extra spaces.
        </p>
        <p style={hint}>
          • <b>Different abbreviation</b> (single-word key): schedule <code>RTM</code> → roster
          <code> RM</code>. The schedule keeps its own code for display; the roster&apos;s form maps onto
          it (section suffixes kept, e.g. RTM-A → RM-A). &nbsp;• <b>Venue cell</b> (multi-word key):
          schedule <code>YMHC MN Common Room</code> → <code>YMHC</code>. The class is stored as
          <code> YMHC</code> with <i>MN Common Room</i> as its room, so a student enrolled in YMHC sees
          it — no matter when you add this rule.
        </p>
        <PairEditor
          pairs={value.aliases} keyLabel="Schedule (RTM / YMHC MN Common Room)" valLabel="Roster (RM / YMHC)"
          onChange={(aliases) => onChange({ ...value, aliases })}
        />
      </div>

      <SaveBar onSave={onSave} />
    </>
  )
}

// ── Sections tab (sections + keywords) ───────────────────────────────────────────────────────────

function SectionsTab({
  sections, keywords, onChange, onSave,
}: { sections: SectionConfig; keywords: KeywordConfig; onChange: (s: SectionConfig, k: KeywordConfig) => void; onSave: () => void }) {
  return (
    <>
      <div style={card}>
        <span style={labelStyle}>1st-year section labels</span>
        <p style={hint}>
          Every section a 1st-year student can belong to. Labels can be more than one character
          (e.g. programme cohorts <code>Fin</code>, <code>LSM</code> alongside <code>A</code>…<code>H</code>).
          Comma-separated. These drive section detection everywhere — header rows, in-cell tags and
          Course-Details allocation.
        </p>
        <CommaInput value={sections.sectionLabels} onChange={(sectionLabels) => onChange({ ...sections, sectionLabels }, keywords)} placeholder="A, B, C, D, E, F, G, H, Fin, LSM" />
      </div>

      <div style={card}>
        <span style={labelStyle}>Where is the section written?</span>
        <p style={hint}>
          How your 1st-year sheet identifies a section. <b>Auto</b> handles both and is recommended.
        </p>
        {([
          ['auto', 'Automatic (recommended)', 'Detect per sheet: a "Sec A" header row → column; otherwise a classroom-only header → in the cell.'],
          ['column', 'In the column header', 'Legacy layout: a "Sec A"…"Sec H" row. The column is the section; the cell is the bare course code.'],
          ['cell', 'Inside each cell', 'New layout: classroom-only headers ("CR A1"). Each cell is course + section, e.g. "DA-B", "ME-Fin".'],
        ] as [SectionConfig['sectionSource'], string, string][]).map(([val, title, desc]) => (
          <label key={val} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
            <input type="radio" checked={(sections.sectionSource ?? 'auto') === val} onChange={() => onChange({ ...sections, sectionSource: val }, keywords)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 13 }}><b>{title}</b> — {desc}</span>
          </label>
        ))}
      </div>

      <div style={card}>
        <span style={labelStyle}>In-cell section separator</span>
        <p style={hint}>Splits course from section when the section is in the cell — e.g. <code>-</code> in <code>ME-Fin</code>. Used only by the &quot;inside each cell&quot; layout.</p>
        <input value={sections.cellSectionSeparator} onChange={(e) => onChange({ ...sections, cellSectionSeparator: e.target.value }, keywords)} style={{ ...inputStyle, width: 100 }} placeholder="-" />
      </div>

      <div style={card}>
        <span style={labelStyle}>Classroom-header pattern (regex)</span>
        <p style={hint}>Identifies the classroom columns of an &quot;inside each cell&quot; sheet, e.g. <code>CR A1</code>/<code>MDC C6</code>. Default <code>^(CR|MDC)\b</code>.</p>
        <input value={sections.roomHeaderPattern} onChange={(e) => onChange({ ...sections, roomHeaderPattern: e.target.value }, keywords)} style={{ ...inputStyle, width: 260, fontFamily: 'monospace' }} />
      </div>

      <div style={card}>
        <span style={labelStyle}>Section-header prefix</span>
        <p style={hint}>The word before the section label in a &quot;column header&quot; sheet (e.g. &quot;Sec&quot; for &quot;Sec A&quot;).</p>
        <input value={sections.sectionHeaderPrefix} onChange={(e) => onChange({ ...sections, sectionHeaderPrefix: e.target.value }, keywords)} style={{ ...inputStyle, width: 160 }} placeholder="Sec" />
      </div>

      <div style={card}>
        <span style={labelStyle}>2nd-year division-code pattern (regex)</span>
        <p style={hint}>Identifies division-column codes like D1/E2. Default <code>^[A-Z]\d+$</code>. Advanced — leave as-is unless your division codes differ.</p>
        <input value={sections.divisionCodePattern} onChange={(e) => onChange({ ...sections, divisionCodePattern: e.target.value }, keywords)} style={{ ...inputStyle, width: 260, fontFamily: 'monospace' }} />
      </div>

      <div style={card}>
        <span style={labelStyle}>Skip words (filler rows)</span>
        <p style={hint}>Cells matching any of these are ignored, not treated as a class (lunch, break…). Comma-separated.</p>
        <CommaInput value={keywords.skipWords} onChange={(skipWords) => onChange(sections, { ...keywords, skipWords })} placeholder="lunch, break, recess…" />
      </div>

      <div style={card}>
        <span style={labelStyle}>Event words (common events)</span>
        <p style={hint}>Text matching any of these is a common event for everyone (exam, viva…). Comma-separated.</p>
        <CommaInput value={keywords.eventWords} onChange={(eventWords) => onChange(sections, { ...keywords, eventWords })} placeholder="exam, mid term, viva…" />
      </div>

      <SaveBar onSave={onSave} />
    </>
  )
}

// ── reusable editors ─────────────────────────────────────────────────────────────────────────────

// Edit a Record<string,string> as add/removable key→value rows.
function PairEditor({ pairs, keyLabel, valLabel, onChange }: { pairs: Record<string, string>; keyLabel: string; valLabel: string; onChange: (p: Record<string, string>) => void }) {
  const entries = Object.entries(pairs)
  function setEntry(idx: number, k: string, v: string) {
    const next: Record<string, string> = {}
    entries.forEach(([ek, ev], i) => { const key = i === idx ? k : ek; if (key) next[key] = i === idx ? v : ev })
    onChange(next)
  }
  return (
    <div>
      {entries.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <input value={k} onChange={(e) => setEntry(i, e.target.value, v)} placeholder={keyLabel} style={{ ...inputStyle, flex: 1 }} />
          <span style={{ color: '#94a3b8' }}>→</span>
          <input value={v} onChange={(e) => setEntry(i, k, e.target.value)} placeholder={valLabel} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={() => onChange(Object.fromEntries(entries.filter((_, j) => j !== i)))} style={{ ...delBtn, padding: '4px 8px' }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange({ ...pairs, '': '' })} style={smallBtn}>+ Add</button>
    </div>
  )
}

// Edit a string[] as a single comma-separated input (kept simple for short lists like section labels).
function CommaInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => { setText(value.join(', ')) }, [value])
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(',').map((s) => s.trim()).filter(Boolean))}
      placeholder={placeholder}
      style={{ ...inputStyle, width: '100%' }}
    />
  )
}
