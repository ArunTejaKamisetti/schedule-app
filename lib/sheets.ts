import { google } from 'googleapis'
import type { CellFormat, RawSheetData, SheetMerge } from './types'
import type { SheetSource } from './sheets-config'
import { getSheetsOAuthClient } from './google-auth'
import {
  DEFAULT_PROFILE, classifyBySwatches, matchesKeyword,
  sectionHeaderRegex, divisionCodeRegex, type ColorRules, type InstitutionProfile,
} from './institution-profile'

// ─── Course catalog (institution-configurable; defaults = IIM-K) ──────────────
// The cross-sheet aliases used to be hardcoded here. They now live in the Institution Profile
// (admin-editable, per deployment). This re-export points at DEFAULT_PROFILE so existing imports keep
// working; the live sync passes the admin-configured profile into the functions below.
export const ABBR_ALIAS = DEFAULT_PROFILE.catalog.aliases

export interface CourseDetail {
  name: string
  credits: string
  faculty: string
}

// Collapse embedded newlines / whitespace runs in a raw sheet cell into a clean single-line
// code — e.g. the admin's "YMHC\nMN Common Room" → "YMHC MN Common Room".
export function cleanCode(code: string): string {
  return (code || '').replace(/\s+/g, ' ').trim()
}

// Normalise a code for case- and whitespace-insensitive comparison ("YMHC\nMN  Common Room" →
// "YMHC MN COMMON ROOM"). Used by the alias matchers so a messy/multi-word cell still compares equal.
function normCode(s: string): string {
  return (s || '').toUpperCase().replace(/\s+/g, ' ').trim()
}

// Forward alias: a SCHEDULE code → its canonical (roster / Course-Details) code, matched on the WHOLE
// code (case/whitespace-insensitive). Handles a messy venue cell ("YMHC MN Common Room" → "YMHC") and
// a plain code ("RTM" → "RM"). Returns the code unchanged if no alias matches.
function aliasForward(code: string, aliases: Record<string, string>): string {
  const n = normCode(code)
  for (const [k, v] of Object.entries(aliases)) if (normCode(k) === n) return v
  return code
}

// A "venue / whole-cell" alias is one whose KEY is a multi-word cell ("YMHC MN Common Room" → "YMHC")
// — as opposed to a plain code alias whose key is a single token ("RTM" → "RM"). The two are handled
// differently: a venue alias normalises the schedule cell to its real code at parse time, a plain
// alias leaves the schedule code as written and maps the roster onto it.
function isVenueAliasKey(key: string): boolean {
  return /\s/.test(key.trim())
}

// Resolve a SCHEDULE cell to its stored course code (+ display name, for a venue cell). For a VENUE
// alias whose key matches the whole cell, store the real code ('YMHC') so the class matches the
// roster's clean 'YMHC' regardless of when the alias was added — but DISPLAY the cell verbatim (the
// `name`, e.g. 'YMHC MN Common Room'). The room is left to the section/division column (the parser
// uses `s.room`); the alias never rewrites it. A plain cell (or a plain code alias) keeps its own code.
export function normalizeScheduleCode(
  raw: string, aliases: Record<string, string> = DEFAULT_PROFILE.catalog.aliases
): { code: string; name?: string } {
  const cleaned = cleanCode(raw)
  const n = normCode(cleaned)
  for (const [k, target] of Object.entries(aliases)) {
    if (!isVenueAliasKey(k) || normCode(k) !== n) continue
    return { code: target, name: cleaned }
  }
  return { code: cleaned }
}

// Strip section suffix and program qualifiers to get the base abbreviation
// "GT-A" → "GT", "SOMA-B" → "SOMA", "FC (FIN)" → "FC", "ST (FIN-Core)" → "ST"
export function getBaseAbbr(code: string): string {
  const sectionMatch = code.match(/^(.+)-[A-C]$/)
  if (sectionMatch) return sectionMatch[1]
  const qualMatch = code.match(/^([^\s(]+)\s*\(/)
  if (qualMatch) return qualMatch[1]
  return code
}

// (Cross-sheet aliases — Schedule abbr → Course-Details abbr, e.g. "RTM" → "RM" — now live in the
// Institution Profile catalog; see the ABBR_ALIAS re-export near the top of this file.)

// Normalise an abbreviation for cross-sheet matching: uppercase, collapse spaces,
// and tighten brackets so "PF (FIN-Core)" and "PF(FIN-Core)" become the same key.
function normAbbr(s: string): string {
  return (s || '').toUpperCase().replace(/\s+/g, ' ').replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')').trim()
}

// The (normalised) key to look a course up by in the Course Details map.
// Strips the -A/-B/-C section marker but keeps the programme qualifier, and applies
// known cross-sheet aliases — so "DS-A (LSM-Core)" → "DS(LSM-CORE)", "CV (FIN-Core)" →
// "CV(FIN-CORE)", "GT-B" → "GT", "RTM" → "RM".
export function getDetailAbbr(code: string, profile: InstitutionProfile = DEFAULT_PROFILE): string {
  const aliases = profile.catalog.aliases
  // Whole-cell alias first (e.g. "YMHC MN Common Room" → "YMHC"); then the usual section-strip +
  // base-abbr alias (e.g. "RTM-A" → "RTM" → "RM").
  let key = normAbbr(aliasForward(code, aliases)).replace(/-[A-C](?=\(|$)/g, '')
  const base = key.split('(')[0]
  if (aliases[base]) key = aliases[base] + key.slice(base.length)
  return key
}

// Map a ROSTER/enrolment code onto the SCHEDULE's code, so user_sessions (which matches course_code
// EXACTLY) lines them up — WITHOUT changing what the schedule stores/shows. The schedule code is the
// source of truth for display; the alias only normalises the roster's alternate spelling.
//   alias { RTM: 'RM' }  (schedule "RTM" == Course-Details/roster "RM")
//   "RM"   → "RTM"   (roster wrote the details code → map back to the schedule code)
//   "RM-A" → "RTM-A" (section/qualifier suffix kept)
//   "RTM"  → "RTM"   (roster already wrote the schedule code → unchanged)
//   "GT-A" → "GT-A"  (no alias → unchanged)
export function aliasToScheduleCode(code: string, aliases: Record<string, string> = DEFAULT_PROFILE.catalog.aliases): string {
  const base = getBaseAbbr(code)
  const up = base.toUpperCase()
  if (aliases[base] ?? aliases[up]) return code // already a schedule-side code (an alias key)
  // Only PLAIN code aliases (single-token key) reverse-map onto the schedule code. A venue alias is
  // normalised at PARSE time (normalizeScheduleCode), so the stored course_code already equals the
  // roster's clean code — leave it untouched, or we'd turn "YMHC" back into "YMHC MN Common Room".
  const entry = Object.entries(aliases).find(([k, v]) => !isVenueAliasKey(k) && v.toUpperCase() === up)
  return entry ? entry[0] + code.slice(base.length) : code
}

// Parse the Course Details tab into a lookup map.
//  - division (2nd year): keyed by normalised abbr → {name, credits, faculty}.
//  - section  (1st year): faculty is per section group, so additionally keyed by `ABBR|SECTION`
//    (the abbr row carries name+credit; following rows give faculty for each section allocation).
export function parseCourseDetails(
  rows: string[][], layout: 'division' | 'section' = 'division', profile: InstitutionProfile = DEFAULT_PROFILE
): Map<string, CourseDetail> {
  const map = new Map<string, CourseDetail>()
  if (!rows || rows.length < 2) return map

  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i].some((cell) => /abbr/i.test(cell || ''))) { headerIdx = i; break }
  }
  if (headerIdx === -1) return map

  const header = rows[headerIdx].map((h) => h.toLowerCase().trim())
  const abbrCol = findCol(header, ['abbr', 'abbreviation'])
  const nameCol = findCol(header, ['course', 'name', 'title'])
  const creditsCol = findCol(header, ['credit', 'credits', 'units'])
  const facultyCol = findCol(header, ['faculty', 'instructor', 'teacher', 'professor'])
  const sectionCol = findCol(header, ['section'])
  if (abbrCol === -1) return map

  if (layout === 'section') {
    let curAbbr = '', curName = '', curCredit = ''
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.every((c) => !c?.trim())) continue
      const abbr = getCell(row, abbrCol).trim()
      if (abbr) {
        curAbbr = normAbbr(abbr)
        curName = getCell(row, nameCol).trim()
        curCredit = getCell(row, creditsCol).trim()
        map.set(curAbbr, { name: curName, credits: curCredit, faculty: getCell(row, facultyCol).trim() })
      }
      if (!curAbbr) continue
      const alloc = getCell(row, sectionCol).trim()
      const faculty = getCell(row, facultyCol).trim()
      if (!alloc || !faculty) continue
      const labels = (profile.sections.sectionLabels.length ? profile.sections.sectionLabels : ['A']).map((l) => l.toUpperCase())
      const secs = /all/i.test(alloc)
        ? labels
        : [...new Set(alloc.toUpperCase().replace(new RegExp(`[^${labels.join('')}]`, 'g'), '').split('').filter(Boolean))]
      for (const sec of secs) map.set(`${curAbbr}|${sec}`, { name: curName, credits: curCredit, faculty })
    }
    return map
  }

  if (nameCol === -1) return map
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => !c?.trim())) continue
    const abbr = getCell(row, abbrCol).trim()
    const name = getCell(row, nameCol).trim()
    if (!abbr || !name) continue
    map.set(normAbbr(abbr), { name, credits: getCell(row, creditsCol).trim(), faculty: getCell(row, facultyCol).trim() })
  }
  return map
}

// The Course-Details lookup key for a parsed row, given the source layout. For 1st year it is
// `ABBR|SECTION` (with `ABBR` fallback for name/credit); for 2nd year it is getDetailAbbr.
export function detailKey(
  code: string, sheetTab: string, layout: 'division' | 'section', profile: InstitutionProfile = DEFAULT_PROFILE
): { primary: string; fallback: string } {
  if (layout === 'section') return { primary: `${normAbbr(code)}|${sheetTab}`, fallback: normAbbr(code) }
  const k = getDetailAbbr(code, profile)
  return { primary: k, fallback: k }
}

// ─── Cell formatting helpers (cell-color change detection) ────────────────────

// Convert Google's {red,green,blue} floats (0–1) to a hex string. Near-white → null.
export function rgbToHex(
  color: { red?: number | null; green?: number | null; blue?: number | null } | undefined | null
): string | null {
  if (!color) return null
  const r = Math.round((color.red ?? 0) * 255)
  const g = Math.round((color.green ?? 0) * 255)
  const b = Math.round((color.blue ?? 0) * 255)
  if (r > 250 && g > 250 && b > 250) return null // white/default = no fill
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// Bucket a hex fill: red = cancelled, green = added, event = holiday/festival/exam (amber).
//   • 'auto' mode (default, IIM-K): relative channel dominance (not absolute thresholds) so
//     pastel/light highlights (e.g. light red #f4cccc, light green #d9ead3) are still detected.
//   • 'custom' mode: nearest DECLARED swatch within tolerance (for institutions whose colour
//     conventions differ from red/green/amber) — see classifyBySwatches.
export function classifyColor(hex: string | null, colors: ColorRules = DEFAULT_PROFILE.colors): 'red' | 'green' | 'event' | 'normal' {
  if (!hex) return 'normal'
  if (colors.mode === 'custom') return classifyBySwatches(hex, colors)
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  // Amber/orange (#ffc000, #ff9900) = events/holidays/exams. Checked FIRST so it isn't read as
  // a cancellation. Warm: red & green both substantial, blue near zero. (Light-red #f4cccc has
  // HIGH blue, so it falls through to 'red'.)
  if (r > 0.8 && g >= 0.4 && g < 0.95 && b < 0.4 && r - b > 0.4) return 'event'
  // Red channel clearly dominant over both others.
  if (r - g > 0.10 && r - b > 0.10) return 'red'
  // Green channel clearly dominant over both others.
  if (g - r > 0.06 && g - b > 0.05) return 'green'
  return 'normal'
}

// Resolve a tab title from the sheet's tab list: explicit override → name match → index fallback.
// Name-matching survives the per-term rename (Term IV → Term V Schedule) with no code change.
function pickTab(titles: string[], explicit: string | undefined, re: RegExp, fallbackIdx: number): string {
  if (explicit && titles.includes(explicit)) return explicit
  if (explicit) return explicit
  return titles.find((t) => re.test(t)) ?? titles[fallbackIdx] ?? titles[0] ?? ''
}

// Fetch a source's schedule + details tabs WITH per-cell formatting (bg colour + strikethrough)
// and the schedule tab's merge ranges (to span grouped events across dates).
export async function fetchBothSheetTabsWithFormatting(source: SheetSource): Promise<RawSheetData> {
  const auth = await getSheetsOAuthClient()
  const sheets = google.sheets({ version: 'v4', auth })

  // Resolve tab names (auto-detect by default).
  const meta = await sheets.spreadsheets.get({ spreadsheetId: source.sheetId, fields: 'sheets.properties.title' })
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean)
  const scheduleTab = pickTab(titles, source.scheduleTab, /schedule/i, 0)
  const detailsTab = pickTab(titles, source.detailsTab, /course\s*detail/i, 1)

  const response = await sheets.spreadsheets.get({
    spreadsheetId: source.sheetId,
    ranges: [`'${scheduleTab}'`, `'${detailsTab}'`],
    includeGridData: true,
    fields:
      'sheets(properties.title,merges,data.rowData.values(formattedValue,effectiveFormat(backgroundColor,textFormat.strikethrough)))',
  })

  const sheetsData = response.data.sheets ?? []
  const byTitle = new Map(sheetsData.map((s) => [s.properties?.title ?? '', s]))
  const scheduleSheet = byTitle.get(scheduleTab) ?? sheetsData[0]
  const detailsSheet = byTitle.get(detailsTab) ?? sheetsData[1]

  const sheet1: string[][] = []
  const sheet1_format: CellFormat[][] = []
  for (const row of scheduleSheet?.data?.[0]?.rowData ?? []) {
    const values = row.values ?? []
    sheet1.push(values.map((c) => c.formattedValue ?? ''))
    sheet1_format.push(
      values.map((c) => ({
        bgColor: rgbToHex(c.effectiveFormat?.backgroundColor),
        strikethrough: c.effectiveFormat?.textFormat?.strikethrough ?? false,
      }))
    )
  }
  const merges: SheetMerge[] = (scheduleSheet?.merges ?? []).map((m) => ({
    startRow: m.startRowIndex ?? 0, endRow: m.endRowIndex ?? 0,
    startCol: m.startColumnIndex ?? 0, endCol: m.endColumnIndex ?? 0,
  }))

  const sheet2: string[][] = []
  for (const row of detailsSheet?.data?.[0]?.rowData ?? []) {
    sheet2.push((row.values ?? []).map((c) => c.formattedValue ?? ''))
  }

  return { sheet1, sheet2, sheet1_format, merges, layout: source.layout, year: source.year, fetched_at: new Date().toISOString() }
}

export interface ParseOpts {
  layout?: 'division' | 'section'
  format?: CellFormat[][]
  merges?: SheetMerge[]
  profile?: InstitutionProfile
}

export function parseSheetRows(rows: string[][], opts: ParseOpts = {}): ParsedCourse[] {
  if (!rows || rows.length === 0) return []
  const layout = opts.layout ?? 'division'
  const profile = opts.profile ?? DEFAULT_PROFILE
  const sectionHeaderIdx = findSectionHeaderRow(rows, layout, profile)
  if (sectionHeaderIdx !== -1) return parseScheduleMatrix(rows, sectionHeaderIdx, layout, profile, opts.format, opts.merges)
  return parseFlatList(rows, 'Sheet1')
}

// ─── Matrix parser (schedule grid) ────────────────────────────────────────────

function findSectionHeaderRow(rows: string[][], layout: 'division' | 'section', profile: InstitutionProfile): number {
  // division: D1/E2-style codes. section: "Sec A" … "Sec H". Both patterns come from the profile.
  const re = layout === 'section' ? sectionHeaderRegex(profile.sections) : divisionCodeRegex(profile.sections)
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const count = (rows[i] || []).filter((c) => re.test((c || '').trim())).length
    if (count >= 2) return i
  }
  return -1
}

function parseScheduleMatrix(
  rows: string[][], sectionHeaderIdx: number, layout: 'division' | 'section',
  profile: InstitutionProfile, format?: CellFormat[][], merges?: SheetMerge[]
): ParsedCourse[] {
  const sectionRow = rows[sectionHeaderIdx]
  const aboveRow = sectionHeaderIdx > 0 ? rows[sectionHeaderIdx - 1] : []

  // Section columns. division: header is the section/division code (D1) and IS the room.
  // section: header is "Sec A" → sheet_tab "A"; room = the cell in the row above (e.g. "CR A1").
  const sections: { col: number; label: string; code: string; room: string }[] = []
  if (layout === 'section') {
    const secRe = sectionHeaderRegex(profile.sections)
    for (let col = 0; col < sectionRow.length; col++) {
      const m = (sectionRow[col] || '').trim().match(secRe)
      if (!m) continue
      sections.push({ col, code: m[1].toUpperCase(), label: m[1].toUpperCase(), room: (aboveRow[col] || '').trim() })
    }
  } else {
    const divRe = divisionCodeRegex(profile.sections)
    for (let col = 0; col < sectionRow.length; col++) {
      const sc = (sectionRow[col] || '').trim()
      if (!sc || !divRe.test(sc)) continue
      // A class's identity + classroom is the division code ALONE (D1/E3…) — the LAST (bottom-most)
      // header row. We deliberately ignore every header row ABOVE it (programme labels like
      // "PGP-29"/"PGPFIN06", the title, etc.). A class's slot key is `date+time+sheet_tab`, so if the
      // sheet_tab embedded the programme label, merely editing/reordering that upper row would re-key
      // every class and the diff would report the ENTIRE sheet as "Moved" (the mass-phantom-move bug).
      sections.push({ col, code: sc, label: sc, room: sc })
    }
  }
  if (sections.length === 0) return []
  const sectionCols = sections.map((s) => s.col)

  // Fill-forward the date column so merged/grouped date cells still resolve per row.
  const effDate: string[] = new Array(rows.length).fill('')
  let cur = ''
  for (let r = sectionHeaderIdx + 1; r < rows.length; r++) {
    const d = parseFullDate(((rows[r] || [])[0] || '').trim())
    if (d) cur = d
    effDate[r] = cur
  }

  const results: ParsedCourse[] = []
  const { skipWords, eventWords } = profile.keywords
  const isSkip = (s: string) => matchesKeyword(s, skipWords)
  const isEvent = (s: string) => matchesKeyword(s, eventWords)
  const colState = (r: number, c: number) => classifyColor(format?.[r]?.[c]?.bgColor ?? null, profile.colors)
  const emitted = new Set<string>() // dedup events by name|date

  for (let rowIdx = sectionHeaderIdx + 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]
    if (!row || row.length < 2) continue
    const isoDate = effDate[rowIdx]
    if (!isoDate) continue
    const timeStr = (row[1] || '').trim()
    const { start, end } = parseMatrixTimeRange(timeStr)

    // Event/holiday/exam: an event-coloured body cell with text, OR exam-keyword text. Common to all.
    let eventName = ''
    for (const s of sections) {
      const v = (row[s.col] || '').trim()
      if (!v) continue
      if (colState(rowIdx, s.col) === 'event' || isEvent(v)) { eventName = v; break }
    }
    if (eventName) {
      const kind: ParsedCourse['event_kind'] = isEvent(eventName) ? 'exam' : 'event'
      const code = eventName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40) || `EVENT_${rowIdx}`
      for (const d of eventDates(rowIdx, sectionCols, merges, effDate, rows, profile)) {
        const dk = `${code}|${d}`
        if (emitted.has(dk)) continue
        emitted.add(dk)
        results.push({
          course_code: code, course_name: eventName, instructor: '',
          day_of_week: isoWeekday(d), session_date: d,
          start_time: start || '09:00', end_time: end || '17:00',
          room: '', credits: '', sheet_tab: 'COMMON', sheet_row_index: rowIdx,
          is_common: true, event_kind: kind,
        })
      }
      continue
    }

    // Regular classes need a time.
    if (!timeStr || isSkip(timeStr)) continue
    const day = parseDayFromDate((row[0] || '').trim()) || isoWeekday(isoDate)
    for (const s of sections) {
      const raw = (row[s.col] || '').trim()
      if (!raw || isSkip(raw)) continue
      // A plain cell stores the SCHEDULE's own cleaned code (the source of truth for display); a
      // VENUE cell ("YMHC\nMN Common Room") normalises to the real code ("YMHC") for roster matching
      // but keeps the FULL cell as its display name, and keeps the column's own room (s.room) — the
      // alias never invents a room. Details resolve through the code.
      const { code, name } = normalizeScheduleCode(raw, profile.catalog.aliases)
      results.push({
        course_code: code, course_name: name ?? code, instructor: '',
        day_of_week: day, session_date: isoDate, start_time: start, end_time: end,
        room: s.room, credits: '', sheet_tab: s.label, sheet_row_index: rowIdx, sheet_col: s.col,
        is_common: false, event_kind: 'class',
      })
    }
  }
  return results
}

// Dates an event covers: the merge spanning its section cells (precise), else this row plus the
// following blank-dated rows (the legacy banner heuristic, for snapshots without merge data).
function eventDates(
  rowIdx: number, sectionCols: number[], merges: SheetMerge[] | undefined,
  effDate: string[], rows: string[][], profile: InstitutionProfile
): string[] {
  const set = new Set<string>()
  const merge = (merges ?? []).find(
    (m) => rowIdx >= m.startRow && rowIdx < m.endRow && sectionCols.some((c) => c >= m.startCol && c < m.endCol)
  )
  if (merge) {
    for (let r = merge.startRow; r < merge.endRow; r++) if (effDate[r]) set.add(effDate[r])
    return [...set]
  }
  if (effDate[rowIdx]) set.add(effDate[rowIdx])
  for (let k = rowIdx + 1; k < rows.length && set.size <= 14; k++) {
    const nr = rows[k] || []
    const resumes = sectionCols.some((c) => {
      const v = (nr[c] || '').trim()
      return v && !matchesKeyword(v, profile.keywords.skipWords) && !matchesKeyword(v, profile.keywords.eventWords)
    })
    if (resumes) break
    if (effDate[k]) set.add(effDate[k]); else break
  }
  return [...set]
}

function parseDayFromDate(dateStr: string): string {
  const lower = dateStr.toLowerCase()
  const dayMap: [string, string][] = [
    ['monday', 'MON'], ['tuesday', 'TUE'], ['wednesday', 'WED'],
    ['thursday', 'THU'], ['friday', 'FRI'], ['saturday', 'SAT'], ['sunday', 'SUN'],
  ]
  for (const [name, code] of dayMap) {
    if (lower.includes(name)) return code
  }
  return ''
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// Parse a sheet date to "YYYY-MM-DD" (string-wise, no Date object, to avoid TZ shifts).
// Handles both day-first ("Tuesday, 9 June, 2026") and month-first ("Tuesday, January 6, 2026");
// the weekday prefix is naturally rejected because it isn't a valid month.
export function parseFullDate(dateStr: string): string {
  // Day-first: "9 June, 2026"
  let m = dateStr.match(/(\d{1,2})\s*[-/ ]?\s*([A-Za-z]{3,})[,\s]+(\d{4})/)
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (month) return `${m[3]}-${month}-${m[1].padStart(2, '0')}`
  }
  // Month-first: "January 6, 2026"
  m = dateStr.match(/([A-Za-z]{3,})\s+(\d{1,2})[,\s]+(\d{4})/)
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()]
    if (month) return `${m[3]}-${month}-${m[2].padStart(2, '0')}`
  }
  return ''
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
function isoWeekday(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? ''
}

function parseMatrixTimeRange(timeStr: string): { start: string; end: string } {
  // Handles "09.15-10.30", "09:15-10:30", "9.15 - 10.30"
  const normalized = timeStr.replace(/\./g, ':')
  const match = normalized.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/)
  if (!match) return { start: '', end: '' }
  return { start: padTime(match[1]), end: padTime(match[2]) }
}

function padTime(t: string): string {
  const [h, m] = t.split(':')
  return `${String(parseInt(h)).padStart(2, '0')}:${m}`
}

// ─── Flat list parser (Course Details tab) ────────────────────────────────────

function parseFlatList(rows: string[][], sheetTab: string): ParsedCourse[] {
  if (rows.length < 2) return []

  const header = rows[0].map((h) => h.toLowerCase().trim())

  const colIndex = {
    code: findCol(header, ['code', 'course code', 'subject code', 'course_code']),
    name: findCol(header, ['name', 'course name', 'subject', 'title', 'course_name']),
    instructor: findCol(header, ['instructor', 'faculty', 'teacher', 'professor', 'staff']),
    day: findCol(header, ['day', 'day of week', 'days', 'weekday']),
    start: findCol(header, ['start', 'start time', 'from', 'begin']),
    end: findCol(header, ['end', 'end time', 'to', 'finish']),
    room: findCol(header, ['room', 'venue', 'location', 'hall']),
    credits: findCol(header, ['credits', 'credit', 'units', 'hrs', 'hours']),
    time: findCol(header, ['time', 'timing', 'schedule']),
  }

  const results: ParsedCourse[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((cell) => !cell?.trim())) continue

    const code = getCell(row, colIndex.code)
    const name = getCell(row, colIndex.name)
    if (!code && !name) continue

    let startTime = getCell(row, colIndex.start)
    let endTime = getCell(row, colIndex.end)
    let day = normalizeDay(getCell(row, colIndex.day))

    if ((!startTime || !endTime) && colIndex.time !== -1) {
      const timeStr = getCell(row, colIndex.time)
      const parsed = parseLegacyTimeRange(timeStr)
      if (parsed) {
        startTime = startTime || parsed.start
        endTime = endTime || parsed.end
        day = day || parsed.day || ''
      }
    }

    results.push({
      course_code: code || `ROW_${i}`,
      course_name: name || code || '',
      instructor: getCell(row, colIndex.instructor),
      day_of_week: day,
      session_date: '',
      start_time: normalizeTimeLegacy(startTime),
      end_time: normalizeTimeLegacy(endTime),
      room: getCell(row, colIndex.room),
      credits: getCell(row, colIndex.credits),
      sheet_tab: sheetTab,
      sheet_row_index: i,
      is_common: false,
      event_kind: 'class',
    })
  }

  return results
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export interface ParsedCourse {
  course_code: string
  course_name: string
  instructor: string
  day_of_week: string
  session_date: string   // ISO YYYY-MM-DD parsed from the sheet's date column ('' if unknown)
  start_time: string
  end_time: string
  room: string
  credits: string
  sheet_tab: string
  sheet_row_index: number
  sheet_col?: number       // exact matrix column of this session's cell (for precise colour reads)
  is_common: boolean
  event_kind: 'class' | 'exam' | 'common' | 'event'
  is_cancelled?: boolean   // derived from cell colour/strikethrough during diff
  change_kind?: string     // set by the diff when this session changed
  change_note?: string
}

function findCol(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = header.findIndex((h) => h.includes(candidate))
    if (idx !== -1) return idx
  }
  return -1
}

function getCell(row: string[], idx: number): string {
  if (idx === -1 || idx >= row.length) return ''
  return (row[idx] ?? '').trim()
}

function normalizeDay(raw: string): string {
  const map: Record<string, string> = {
    mon: 'MON', monday: 'MON',
    tue: 'TUE', tuesday: 'TUE',
    wed: 'WED', wednesday: 'WED',
    thu: 'THU', thursday: 'THU',
    fri: 'FRI', friday: 'FRI',
    sat: 'SAT', saturday: 'SAT',
    sun: 'SUN', sunday: 'SUN',
  }
  const lower = (raw ?? '').toLowerCase().trim()
  return map[lower] ?? raw?.toUpperCase() ?? ''
}

function normalizeTimeLegacy(raw: string): string {
  if (!raw) return ''
  const cleaned = raw.replace('.', ':').trim()
  const match = cleaned.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i)
  if (!match) return raw
  let hours = parseInt(match[1])
  const mins = match[2] ?? '00'
  const period = (match[3] ?? '').toLowerCase()
  if (period === 'pm' && hours < 12) hours += 12
  if (period === 'am' && hours === 12) hours = 0
  return `${String(hours).padStart(2, '0')}:${mins}`
}

function parseLegacyTimeRange(raw: string): { start: string; end: string; day?: string } | null {
  if (!raw) return null
  const match = raw.match(
    /(?:(mon|tue|wed|thu|fri|sat|sun)[^0-9]*)?([\d]{1,2}[:.][\d]{2}\s*(?:am|pm)?)[\s\-–—]+([\d]{1,2}[:.][\d]{2}\s*(?:am|pm)?)/i
  )
  if (!match) return null
  return {
    day: match[1] ? match[1].toUpperCase() : undefined,
    start: normalizeTimeLegacy(match[2]),
    end: normalizeTimeLegacy(match[3]),
  }
}
