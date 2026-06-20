import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { parseYear1Roster, parseYear2Roster, type RosterRows } from '@/lib/roster-parse'
import { storeYear1Roster, storeYear2Roster } from '@/lib/roster'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/admin/roster  (multipart: type=year1|year2, file=<.xlsx>)
// Parses the roster, stores it (one row per email), and applies it to already-registered users.
// Admin-gated: the caller must be a signed-in ADMIN_EMAILS account.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const form = await req.formData()
  const type = String(form.get('type') ?? '')
  const file = form.get('file')
  if ((type !== 'year1' && type !== 'year2') || !(file instanceof File)) {
    return NextResponse.json({ error: 'Provide type=year1|year2 and an .xlsx file' }, { status: 400 })
  }

  let rows: RosterRows
  try {
    rows = await readXlsx(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Could not read that file as .xlsx' }, { status: 400 })
  }

  const supabase = createServiceClient()
  try {
    if (type === 'year1') {
      const entries = parseYear1Roster(rows)
      const res = await storeYear1Roster(supabase, entries)
      return NextResponse.json({ ok: true, type, ...res, sample: entries.slice(0, 5) })
    }
    const entries = parseYear2Roster(rows)
    const res = await storeYear2Roster(supabase, entries)
    return NextResponse.json({ ok: true, type, ...res, sample: entries.slice(0, 5) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Read the first worksheet into a dense, column-aligned cell matrix the pure parser can scan.
async function readXlsx(buf: ArrayBuffer): Promise<RosterRows> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const colCount = ws.columnCount
  const rows: RosterRows = []
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: (string | number | null)[] = []
    for (let c = 1; c <= colCount; c++) cells.push(cellText(row.getCell(c).value))
    rows.push(cells)
  })
  return rows
}

// exceljs cell values may be objects (rich text, hyperlink, formula result) — flatten to text.
function cellText(v: ExcelJS.CellValue): string | number | null {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number') return v
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; hyperlink?: string }
    if (typeof o.text === 'string') return o.text
    if (o.result != null) return String(o.result)
    if (typeof o.hyperlink === 'string') return o.hyperlink
  }
  return String(v)
}
