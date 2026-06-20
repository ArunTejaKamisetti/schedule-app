// Pure roster parsers — no DB / no Excel lib, so they're fast to unit-test. The upload route
// reads the .xlsx with exceljs into a plain cell matrix and hands it here.
//
// Two separate rosters (Arun's spec):
//   • year-1: email → section            → parseYear1Roster
//   • year-2: email → elective codes     → parseYear2Roster
//
// Both are tolerant: they locate the email column by content (no fixed position), accept files
// with or without a header row, and — for year-2 — handle both "one electives column with
// comma/semicolon-separated codes" and "several code columns".

import { normalizeEmail } from './auth'

export interface Year1RosterEntry { email: string; section: string }
export interface Year2RosterEntry { email: string; codes: string[] }

type Cell = string | number | null | undefined
export type RosterRows = Cell[][]

const cell = (c: Cell): string => (c == null ? '' : String(c)).replace(/\s+/g, ' ').trim()

export function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim())
}

// The column holding emails = the one with the most email-looking cells. Returns -1 if none.
function emailColumn(rows: RosterRows): number {
  const counts = new Map<number, number>()
  for (const row of rows) {
    for (let c = 0; c < (row?.length ?? 0); c++) {
      if (looksLikeEmail(cell(row[c]))) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
  }
  let best = -1, bestN = 0
  for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n }
  return best
}

// First row containing a header cell matching `re` (e.g. /email/). -1 if none.
function headerRowIndex(rows: RosterRows, re: RegExp): number {
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] ?? []).some((c) => re.test(cell(c).toLowerCase()))) return i
  }
  return -1
}

// Columns in the header row whose label matches `re`.
function headerCols(rows: RosterRows, headerIdx: number, re: RegExp): number[] {
  if (headerIdx < 0) return []
  const out: number[] = []
  const header = rows[headerIdx] ?? []
  for (let c = 0; c < header.length; c++) if (re.test(cell(header[c]).toLowerCase())) out.push(c)
  return out
}

// Normalize a section token: "sec a" / "A " → "A"; keep specialisations (LSM/FIN) intact.
export function normalizeSection(raw: string): string {
  return cell(raw).toUpperCase().replace(/^SEC(TION)?\s*/i, '').trim()
}

// Split a cell that may hold several codes ("GT-A, FC (FIN); SOMA-B") into clean codes.
export function splitCodes(raw: string): string[] {
  return cell(raw)
    .split(/[,;/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseYear1Roster(rows: RosterRows): Year1RosterEntry[] {
  const emailCol = emailColumn(rows)
  if (emailCol < 0) return []
  const headerIdx = headerRowIndex(rows, /email|e-?mail/)
  const sectionCols = headerCols(rows, headerIdx, /section|sec\b/)

  const byEmail = new Map<string, string>() // last row wins (re-upload semantics)
  for (let i = 0; i < rows.length; i++) {
    if (i === headerIdx) continue
    const row = rows[i] ?? []
    const email = normalizeEmail(cell(row[emailCol]))
    if (!looksLikeEmail(email)) continue
    // Section = the labelled column if present, else the first other non-empty cell.
    let section = ''
    for (const c of sectionCols) { const v = cell(row[c]); if (v) { section = v; break } }
    if (!section) {
      for (let c = 0; c < row.length; c++) { if (c === emailCol) continue; const v = cell(row[c]); if (v) { section = v; break } }
    }
    section = normalizeSection(section)
    if (section) byEmail.set(email, section)
  }
  return [...byEmail].map(([email, section]) => ({ email, section }))
}

export function parseYear2Roster(rows: RosterRows): Year2RosterEntry[] {
  const emailCol = emailColumn(rows)
  if (emailCol < 0) return []
  const headerIdx = headerRowIndex(rows, /email|e-?mail/)
  const labelledCodeCols = headerCols(rows, headerIdx, /elective|course|code|subject/)
  const nameCols = new Set(headerCols(rows, headerIdx, /name/)) // exclude a display-name column

  const byEmail = new Map<string, string[]>() // last row wins
  for (let i = 0; i < rows.length; i++) {
    if (i === headerIdx) continue
    const row = rows[i] ?? []
    const email = normalizeEmail(cell(row[emailCol]))
    if (!looksLikeEmail(email)) continue
    // Prefer the labelled elective columns; otherwise take every other cell (minus a name column).
    const sourceCols = labelledCodeCols.length > 0
      ? labelledCodeCols
      : row.map((_, c) => c).filter((c) => c !== emailCol && !nameCols.has(c))
    const codes = new Set<string>()
    for (const c of sourceCols) for (const code of splitCodes(cell(row[c]))) codes.add(code)
    byEmail.set(email, [...codes])
  }
  return [...byEmail].map(([email, codes]) => ({ email, codes }))
}
