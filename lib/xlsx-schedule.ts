import ExcelJS from 'exceljs'
import type { Cell, Worksheet } from 'exceljs'
import type { CellFormat, RawSheetData, SheetMerge } from './types'

// Parse an uploaded .xlsx term-schedule workbook into the SAME `RawSheetData` shape the Google
// Sheets fetch produces (values + per-cell fill/strikethrough + merges), so the existing
// diff/ingest pipeline (lib/sync-core) treats an upload exactly like a sync of that source.
// Coordinators colour cells (red = cancelled, green = added) and merge event banners — both are
// preserved here so change-detection keeps working from an upload.

// ── pure helpers (unit-tested) ────────────────────────────────────────────────────────────────

// exceljs ARGB ('FFRRGGBB') or 'RRGGBB' → '#rrggbb'; near-white or unparseable → null
// (matches the Google-path rgbToHex "white = no fill" rule so classifyColor behaves identically).
export function argbToHex(argb?: string | null): string | null {
  if (!argb) return null
  const hex = argb.length === 8 ? argb.slice(2) : argb
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if (r > 250 && g > 250 && b > 250) return null
  return `#${hex.toLowerCase()}`
}

// Spreadsheet column letters → 1-based number. 'A'→1, 'Z'→26, 'AA'→27.
export function colToNum(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

// 'A1:B3' → 0-based, end-EXCLUSIVE box aligned to the sheet1 array (index = sheet row number − 1),
// matching the Google API merge shape the diff consumes (rowIdx >= startRow && rowIdx < endRow).
export function parseMergeRange(range: string): SheetMerge | null {
  const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i)
  if (!m) return null
  const c1 = colToNum(m[1]), r1 = parseInt(m[2], 10), c2 = colToNum(m[3]), r2 = parseInt(m[4], 10)
  return {
    startRow: Math.min(r1, r2) - 1, endRow: Math.max(r1, r2),
    startCol: Math.min(c1, c2) - 1, endCol: Math.max(c1, c2),
  }
}

// ── workbook reading ──────────────────────────────────────────────────────────────────────────

export interface WorkbookOpts {
  layout: 'division' | 'section'
  year: 1 | 2
  scheduleTab?: string
  detailsTab?: string
}

function fillHex(cell: Cell): string | null {
  const fill = cell.fill
  if (!fill || fill.type !== 'pattern') return null
  return argbToHex(fill.fgColor?.argb)
}

// Dense, row-number-aligned read: array index i corresponds to sheet row i+1, so merge boxes line
// up. `cell.text` is the formatted display string (same as the Sheets API FORMATTED_VALUE).
function readGrid(ws: Worksheet | undefined): { values: string[][]; format: CellFormat[][] } {
  const values: string[][] = []
  const format: CellFormat[][] = []
  if (!ws) return { values, format }
  const colCount = Math.max(ws.columnCount, 1)
  const rowCount = ws.rowCount
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r)
    const vrow: string[] = []
    const frow: CellFormat[] = []
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c)
      vrow.push(typeof cell.text === 'string' ? cell.text : '')
      frow.push({ bgColor: fillHex(cell), strikethrough: !!cell.font?.strike })
    }
    values.push(vrow)
    format.push(frow)
  }
  return { values, format }
}

// Resolve a worksheet: explicit name → name regex → undefined (caller supplies an index fallback).
function pickByName(wb: ExcelJS.Workbook, explicit: string | undefined, re: RegExp): Worksheet | undefined {
  if (explicit) {
    const w = wb.getWorksheet(explicit)
    if (w) return w
  }
  return wb.worksheets.find((w) => re.test(w.name))
}

export async function workbookToSheetData(buf: ArrayBuffer, opts: WorkbookOpts): Promise<RawSheetData> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)

  const scheduleWs = pickByName(wb, opts.scheduleTab, /schedule/i) ?? wb.worksheets[0]
  const detailsWs = pickByName(wb, opts.detailsTab, /course\s*detail/i) ?? wb.worksheets[1]

  const schedule = readGrid(scheduleWs)
  const details = readGrid(detailsWs)
  const merges = ((scheduleWs?.model?.merges ?? []) as string[])
    .map(parseMergeRange)
    .filter((m): m is SheetMerge => m !== null)

  return {
    sheet1: schedule.values,
    sheet2: details.values,
    sheet1_format: schedule.format,
    merges,
    layout: opts.layout,
    year: opts.year,
    fetched_at: new Date().toISOString(),
  }
}
