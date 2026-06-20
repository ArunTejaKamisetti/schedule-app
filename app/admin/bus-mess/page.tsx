'use client'

import { useState } from 'react'

// The prompts pin the EXACT JSON schema the app needs, so whatever a free chat tool returns can be
// pasted straight in. The admin's only steps: Copy prompt → paste it + the source file into any
// chat tool → copy the JSON it returns → paste below → Save.
const BUS_PROMPT = `You are given a college bus timetable (attached as a PDF/image). Output ONLY JSON (no prose, no markdown fences) in EXACTLY this schema:

{
  "note": "<one short line shown under the schedule, e.g. 'Bus timings w.e.f. 09 Jun 2026 · same every day.'>",
  "stops": ["<stop name>", "..."],
  "trips": [
    { "time": "8:55 AM", "min": 535, "from": "<origin stop>", "to": ["<next stop>", "..."], "maingate": false }
  ]
}

Rules:
- One object per departure, in chronological order.
- "min" = minutes since midnight (8:55 AM = 535, 1:35 PM = 815). For a 12:00 AM trip that runs AFTER the late-night buses, use 1440.
- "to" = the ordered stops served AFTER "from".
- "maingate" = true only if that trip goes via the Main Gate.
Output ONLY the JSON object.`

const MESS_PROMPT = `You are given a college mess menu (attached as a PDF/image), day-wise. Output ONLY JSON (no prose, no markdown fences) in EXACTLY this schema:

{
  "note": "<one short line, e.g. 'Menu is tentative — changes may occur based on market availability.'>",
  "menu": {
    "MON": {
      "breakfast": { "veg": ["item", "..."], "special": ["Boiled Egg"] },
      "lunch":     { "veg": ["item", "..."], "special": ["Egg Curry"] },
      "dinner":    { "veg": ["item", "..."] }
    }
  }
}

Rules:
- Keys are weekday codes MON, TUE, WED, THU, FRI, SAT, SUN.
- Each day has breakfast, lunch and dinner; each has a "veg" array (vegetarian items).
- "special" (optional) = non-veg / egg / fish / chicken / paneer-special items to highlight.
Output ONLY the JSON object.`

export default function BusMessPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Bus &amp; Mess</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginTop: 4, marginBottom: 24 }}>
        Copy the prompt, paste it plus the source PDF/image into any free chat tool, then paste the
        JSON it returns here and save. No data is typed by hand.
      </p>
      <ImportCard title="Bus schedule" type="bus" prompt={BUS_PROMPT} />
      <ImportCard title="Mess menu" type="mess" prompt={MESS_PROMPT} />
    </main>
  )
}

function ImportCard({ title, type, prompt }: { title: string; type: 'bus' | 'mess'; prompt: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; error?: string; trips?: number; days?: number } | null>(null)

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  async function save() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/bus-mess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data: text }),
      })
      setResult(await res.json())
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
        <button
          onClick={copyPrompt}
          style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          {copied ? 'Copied!' : 'Copy prompt'}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Paste the ${title.toLowerCase()} JSON here…`}
        rows={8}
        style={{ width: '100%', marginTop: 12, padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }}
      />
      <div style={{ marginTop: 10 }}>
        <button
          onClick={save}
          disabled={busy || !text.trim()}
          style={{ background: busy || !text.trim() ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: busy || !text.trim() ? 'default' : 'pointer' }}
        >
          {busy ? 'Saving…' : 'Validate & save'}
        </button>
      </div>
      {result && (
        <p style={{ marginTop: 10, fontSize: 13, color: result.error ? '#b91c1c' : '#15803d' }}>
          {result.error
            ? `Error: ${result.error}`
            : `Saved ✓ ${type === 'bus' ? `${result.trips} trips` : `${result.days} days`}. Students see it within ~10 min (cached).`}
        </p>
      )}
    </section>
  )
}
