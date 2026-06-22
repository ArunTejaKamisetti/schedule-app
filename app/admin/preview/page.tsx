export default async function AdminPreviewPage() {
  let data: Record<string, unknown> | null = null
  let error: string | null = null

  try {
    const { fetchBothSheetTabsWithFormatting, parseSheetRows } = await import('@/lib/sheets')
    const { resolveSheetSources } = await import('@/lib/schedule-sources')
    const { createServiceClient } = await import('@/lib/supabase/server')
    const sources = await resolveSheetSources(createServiceClient())
    const source = sources.find((s) => s.sheetId)
    if (!source) throw new Error('No schedule source configured — paste a Google Sheet link in Admin → Schedule.')
    const raw = await fetchBothSheetTabsWithFormatting(source)
    const parsed1 = parseSheetRows(raw.sheet1)
    const parsed2 = parseSheetRows(raw.sheet2)
    data = {
      fetched_at: raw.fetched_at,
      sheet1: { headers: raw.sheet1[0] ?? [], row_count: raw.sheet1.length - 1, sample: raw.sheet1.slice(0, 5), parsed_count: parsed1.length, parsed_sample: parsed1.slice(0, 5) },
      sheet2: { headers: raw.sheet2[0] ?? [], row_count: raw.sheet2.length - 1, sample: raw.sheet2.slice(0, 5), parsed_count: parsed2.length, parsed_sample: parsed2.slice(0, 5) },
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  return (
    <div style={{ fontFamily: 'monospace', maxWidth: 900, margin: '40px auto', padding: 20, background: '#0f0f0f', color: '#e0e0e0', minHeight: '100vh' }}>
      <h1 style={{ color: '#6366f1' }}>📊 Sheet Preview</h1>
      <p style={{ color: '#888' }}>Fetched: {data ? String((data as any).fetched_at) : '—'}</p>

      {error && (
        <div style={{ background: '#3a0000', border: '1px solid #f00', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <strong style={{ color: '#f00' }}>Error:</strong> {error}
          <br /><br />
          <span style={{ color: '#aaa', fontSize: 12 }}>
            Connect Google once and paste a sheet link in <a href="/admin/schedule" style={{ color: '#6366f1' }}>Admin → Schedule</a>.
          </span>
        </div>
      )}

      {data && (
        <>
          {(['sheet1', 'sheet2'] as const).map((tab) => {
            const t = (data as any)[tab]
            return (
              <div key={tab} style={{ marginBottom: 32 }}>
                <h2 style={{ color: '#22c55e' }}>{tab === 'sheet1' ? 'Term IV Schedule' : 'Course Details'}</h2>
                <p style={{ color: '#888', fontSize: 13 }}>{t.row_count} rows · {t.parsed_count} parsed</p>
                <p><strong>Headers:</strong> {t.headers.join(' | ')}</p>
                <br />
                <strong style={{ color: '#60a5fa' }}>Parsed sample ({t.parsed_sample.length} rows):</strong>
                <pre style={{ background: '#1a1a1a', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 11, marginTop: 6 }}>
                  {JSON.stringify(t.parsed_sample, null, 2)}
                </pre>
                <strong style={{ color: '#f59e0b' }}>Raw rows (first 5):</strong>
                <pre style={{ background: '#1a1a1a', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 11, marginTop: 6 }}>
                  {JSON.stringify(t.sample, null, 2)}
                </pre>
              </div>
            )
          })}
        </>
      )}

      <hr style={{ borderColor: '#333', margin: '24px 0' }} />
      <p style={{ color: '#555', fontSize: 12 }}>
        Once you confirm the parsed data looks correct, trigger a sync at{' '}
        <a href="/api/sync" style={{ color: '#6366f1' }}>/api/sync</a> (add <code>Authorization: Bearer YOUR_CRON_SECRET</code> header).
      </p>
    </div>
  )
}
