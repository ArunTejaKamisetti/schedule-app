import { google } from 'googleapis'
import type { CellFormat, RawSheetData } from './types'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const SCHEDULE_TAB = 'Term IV Schedule'
const DETAILS_TAB = 'Course Details'

// ─── Area map (from List of Electives PDF) ────────────────────────────────────
export const AREA_MAP: Record<string, string> = {
  // ECO
  GT: 'ECO', FC: 'ECO', EMPC: 'ECO',
  // OBHR
  JOY: 'OBHR', LLIR: 'OBHR', NCM: 'OBHR', TTT: 'OBHR',
  LIDA: 'OBHR', TM: 'OBHR', MIO: 'OBHR', GWO: 'OBHR', MBGM: 'OBHR',
  // FAC
  IAPM: 'FAC', CBM: 'FAC', FD: 'FAC', FIS: 'FAC', CV: 'FAC', POF: 'FAC',
  // HLAM
  GC: 'HLAM', WIS: 'HLAM', ILM: 'HLAM', VC: 'HLAM',
  IPR: 'HLAM', LME: 'HLAM', YMHC: 'HLAM', DPI: 'HLAM',
  // IS
  AIB: 'IS', DBT: 'IS', CS: 'IS', DA: 'IS', ECOM: 'IS',
  MITPS: 'IS', SOMA: 'IS', GDBD: 'IS', 'DW3.0': 'IS', EITRM: 'IS', MBGAI: 'IS',
  // DSOM
  HSCM: 'DSOM', DAR: 'DSOM', SOM: 'DSOM', SCM: 'DSOM', PM: 'DSOM',
  // MM
  CB: 'MM', CMO: 'MM', CA: 'MM', RTM: 'MM', MRBDM: 'MM',
  MBM: 'MM', SDM: 'MM', MA: 'MM', DM: 'MM', MOB: 'MM', MAAS: 'MM',
  // SM
  GBS: 'SM', CG: 'SM', SBRA: 'SM', POSS: 'SM',
  CONSULTING: 'SM', IB: 'SM', EOS: 'SM',
}

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

// One-off admin data issue: the venue was typed into YMHC's schedule cell
// ("YMHC MN Common Room"). Treat it as the HLAM elective YMHC for enrichment/area, while the
// caller keeps the admin's label as the display name.
export function isYmhcVenue(code: string): boolean {
  return /^YMHC\b/i.test(code) && /common\s*room/i.test(code)
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

// Schedule (Sheet 1) abbreviation → Course Details (Sheet 2) abbreviation, where the
// two sheets disagree. We keep the Sheet-1 code for display but enrich from the Sheet-2 row.
// e.g. "RTM" in the schedule == "RM" (Retail Management) in Course Details.
export const ABBR_ALIAS: Record<string, string> = { RTM: 'RM' }

// Normalise an abbreviation for cross-sheet matching: uppercase, collapse spaces,
// and tighten brackets so "PF (FIN-Core)" and "PF(FIN-Core)" become the same key.
function normAbbr(s: string): string {
  return (s || '').toUpperCase().replace(/\s+/g, ' ').replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')').trim()
}

// The (normalised) key to look a course up by in the Course Details map.
// Strips the -A/-B/-C section marker but keeps the programme qualifier, and applies
// known cross-sheet aliases — so "DS-A (LSM-Core)" → "DS(LSM-CORE)", "CV (FIN-Core)" →
// "CV(FIN-CORE)", "GT-B" → "GT", "RTM" → "RM".
export function getDetailAbbr(code: string): string {
  if (isYmhcVenue(code)) return 'YMHC' // enrich from the Sheet-2 YMHC row
  let key = normAbbr(code).replace(/-[A-C](?=\(|$)/g, '')
  const base = key.split('(')[0]
  if (ABBR_ALIAS[base]) key = ABBR_ALIAS[base] + key.slice(base.length)
  return key
}

export function getArea(code: string): string {
  if (isYmhcVenue(code)) return 'HLAM'
  // Programme qualifiers take priority (Sheet-2 truth) — a FIN/LSM-core course must land
  // under FIN/LSM Core even if its base abbreviation also exists as a PGP elective area.
  if (/\(FIN[-\s]?Core\)/i.test(code)) return 'FIN Core'
  if (/\(LSM[-\s]?Core\)/i.test(code)) return 'LSM Core'
  if (/\(FIN\)/i.test(code)) return 'FIN Elective'
  if (/\(LSM\)/i.test(code)) return 'LSM Elective'
  const base = getBaseAbbr(code)
  if (AREA_MAP[base]) return AREA_MAP[base]
  return 'Other'
}

// Parse the Course Details tab into an abbreviation → detail lookup map
export function parseCourseDetails(rows: string[][]): Map<string, CourseDetail> {
  const map = new Map<string, CourseDetail>()
  if (!rows || rows.length < 2) return map

  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some((cell) => /abbr/i.test(cell || ''))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return map

  const header = rows[headerIdx].map((h) => h.toLowerCase().trim())
  const abbrCol = findCol(header, ['abbr', 'abbreviation'])
  const nameCol = findCol(header, ['course', 'name', 'title'])
  const creditsCol = findCol(header, ['credit', 'credits', 'units'])
  const facultyCol = findCol(header, ['faculty', 'instructor', 'teacher', 'professor'])

  if (abbrCol === -1 || nameCol === -1) return map

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => !c?.trim())) continue
    const abbr = getCell(row, abbrCol).trim()
    const name = getCell(row, nameCol).trim()
    if (!abbr || !name) continue
    map.set(normAbbr(abbr), {
      name,
      credits: getCell(row, creditsCol).trim(),
      faculty: getCell(row, facultyCol).trim(),
    })
  }

  return map
}

function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })
  return oauth2Client
}

export async function fetchBothSheetTabs(): Promise<RawSheetData> {
  const auth = getOAuth2Client()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [`'${SCHEDULE_TAB}'`, `'${DETAILS_TAB}'`],
    valueRenderOption: 'FORMATTED_VALUE',
  })

  const [sheet1Response, sheet2Response] = response.data.valueRanges ?? []

  return {
    sheet1: (sheet1Response?.values as string[][]) ?? [],
    sheet2: (sheet2Response?.values as string[][]) ?? [],
    fetched_at: new Date().toISOString(),
  }
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

// Bucket a hex fill into the meaningful categories: red = cancelled, green = added.
// Uses relative channel dominance (not absolute thresholds) so pastel/light highlights
// from Google Sheets (e.g. light red #f4cccc, light green #d9ead3) are still detected.
export function classifyColor(hex: string | null): 'red' | 'green' | 'normal' {
  if (!hex) return 'normal'
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  // Red channel clearly dominant over both others.
  if (r - g > 0.10 && r - b > 0.10) return 'red'
  // Green channel clearly dominant over both others.
  if (g - r > 0.06 && g - b > 0.05) return 'green'
  return 'normal'
}

// Fetch both tabs WITH per-cell formatting (background color + strikethrough) so the
// diff can detect colour-based cancellations/additions. Falls back to plain values for
// the Course Details tab (sheet2 formatting isn't needed).
export async function fetchBothSheetTabsWithFormatting(): Promise<RawSheetData> {
  const auth = getOAuth2Client()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    ranges: [`'${SCHEDULE_TAB}'`, `'${DETAILS_TAB}'`],
    includeGridData: true,
    fields:
      'sheets(properties.title,data.rowData.values(formattedValue,effectiveFormat(backgroundColor,textFormat.strikethrough)))',
  })

  const sheetsData = response.data.sheets ?? []
  const byTitle = new Map(sheetsData.map((s) => [s.properties?.title ?? '', s]))

  const scheduleSheet = byTitle.get(SCHEDULE_TAB) ?? sheetsData[0]
  const detailsSheet = byTitle.get(DETAILS_TAB) ?? sheetsData[1]

  const sheet1: string[][] = []
  const sheet1_format: CellFormat[][] = []
  const scheduleRows = scheduleSheet?.data?.[0]?.rowData ?? []
  for (const row of scheduleRows) {
    const values = row.values ?? []
    sheet1.push(values.map((c) => c.formattedValue ?? ''))
    sheet1_format.push(
      values.map((c) => ({
        bgColor: rgbToHex(c.effectiveFormat?.backgroundColor),
        strikethrough: c.effectiveFormat?.textFormat?.strikethrough ?? false,
      }))
    )
  }

  const sheet2: string[][] = []
  const detailRows = detailsSheet?.data?.[0]?.rowData ?? []
  for (const row of detailRows) {
    sheet2.push((row.values ?? []).map((c) => c.formattedValue ?? ''))
  }

  return {
    sheet1,
    sheet2,
    sheet1_format,
    fetched_at: new Date().toISOString(),
  }
}

export async function fetchSheetTabNames(): Promise<string[]> {
  const auth = getOAuth2Client()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties.title',
  })

  return (
    response.data.sheets?.map((s) => s.properties?.title ?? '') ?? []
  )
}

export function parseSheetRows(rows: string[][], sheetTab: string): ParsedCourse[] {
  if (!rows || rows.length === 0) return []

  // Detect matrix format: look for a row with section codes like D1, D2, E1, etc.
  const sectionHeaderIdx = findSectionHeaderRow(rows)
  if (sectionHeaderIdx !== -1) {
    return parseScheduleMatrix(rows, sectionHeaderIdx)
  }

  // Fallback: flat list parser (used for Course Details tab)
  return parseFlatList(rows, sheetTab)
}

// ─── Matrix parser (Term IV Schedule) ────────────────────────────────────────

function findSectionHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = rows[i]
    // Match single-letter + digit section codes (D1, D2, E3) but not program codes (PGPFIN06)
    const sectionCount = row.filter((cell) => /^[A-Z]\d+$/.test((cell || '').trim())).length
    if (sectionCount >= 2) return i
  }
  return -1
}

function parseScheduleMatrix(rows: string[][], sectionHeaderIdx: number): ParsedCourse[] {
  const sectionRow = rows[sectionHeaderIdx]
  const programRow = sectionHeaderIdx > 0 ? rows[sectionHeaderIdx - 1] : []

  // Build section labels using fill-forward for merged program name cells
  const sections: { col: number; label: string; code: string }[] = []
  let lastProgram = ''
  for (let col = 0; col < sectionRow.length; col++) {
    const program = (programRow[col] || '').trim()
    if (program) lastProgram = program

    const sectionCode = (sectionRow[col] || '').trim()
    if (!sectionCode || !/^[A-Z]+\d+$/.test(sectionCode)) continue

    const label = lastProgram ? `${lastProgram} ${sectionCode}` : sectionCode
    sections.push({ col, label, code: sectionCode })
  }

  if (sections.length === 0) return []

  const results: ParsedCourse[] = []
  // Rows/cells that are non-academic filler — dropped entirely. ("MEETING" is a default
  // recurring slot for everyone, so it is removed too.)
  const skipPattern = /lunch|\bbreak\b|registration|holiday|recess|\btea\b|meeting/i
  // Rows that apply to everyone (exams etc.) — captured as common events.
  const commonPattern = /exam|mid.?term|end.?term|\bquiz\b|viva/i

  for (let rowIdx = sectionHeaderIdx + 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]
    if (!row || row.length < 2) continue

    const dateStr = (row[0] || '').trim()
    const timeStr = (row[1] || '').trim()

    if (!dateStr) continue

    const day = parseDayFromDate(dateStr)
    const isoDate = parseFullDate(dateStr)
    if (!isoDate) continue // can't place a session without a real date
    const { start, end } = parseMatrixTimeRange(timeStr)

    // Common events (exams) — show for everyone. Detect BEFORE requiring a time,
    // since exam banner rows often have a date but no time. Default to a full-day window.
    const bodyCells = row.slice(2).map((c) => (c || '').trim())
    const commonCell = bodyCells.find((c) => commonPattern.test(c))
    if (commonCell || commonPattern.test(dateStr) || commonPattern.test(timeStr)) {
      const name = commonCell || bodyCells.find(Boolean) || dateStr
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40) || `COMMON_${rowIdx}`
      // Exam banners are merged cells spanning the following empty dated rows
      // (e.g. MID TERM over Sat+Sun). Cover every date in that span.
      const spanDates = new Set<string>([isoDate])
      for (let k = rowIdx + 1; k < rows.length; k++) {
        const nr = rows[k] || []
        const nIso = parseFullDate((nr[0] || '').trim())
        if (!nIso) break // blank row → end of the merged exam block
        const resumes = nr.slice(2, 10).some((c) => {
          const v = (c || '').trim()
          return v && !skipPattern.test(v) && !commonPattern.test(v)
        })
        if (resumes) break // classes resumed → exam block over
        spanDates.add(nIso)
        if (spanDates.size > 14) break
      }
      for (const d of spanDates) {
        results.push({
          course_code: code,
          course_name: name,
          instructor: '',
          day_of_week: isoWeekday(d),
          session_date: d,
          start_time: start || '09:00',
          end_time: end || '17:00',
          room: '',
          credits: '',
          sheet_tab: 'COMMON',
          sheet_row_index: rowIdx,
          is_common: true,
          event_kind: 'exam',
        })
      }
      continue
    }

    // Regular classes require a time.
    if (!timeStr) continue
    if (skipPattern.test(dateStr) || skipPattern.test(timeStr)) continue

    for (const section of sections) {
      // Skip filler cells (LUNCH BREAK, MEETING, …) per-column — never short-circuit the
      // whole row, or a banner in the first division would drop real classes in the others.
      // Keep the raw code (trim only) so enrolment-by-code stays stable; display names are
      // cleaned downstream (the one multi-line cell, "YMHC\nMN Common Room", renders fine
      // because HTML collapses the newline).
      const courseCode = (row[section.col] || '').trim()
      if (!courseCode || skipPattern.test(courseCode)) continue

      results.push({
        course_code: courseCode,
        course_name: courseCode,
        instructor: '',
        day_of_week: day,
        session_date: isoDate,
        start_time: start,
        end_time: end,
        room: section.code, // the division (D1/E1/…) is the class/room identifier in this sheet
        credits: '',
        sheet_tab: section.label,
        sheet_row_index: rowIdx,
        sheet_col: section.col, // exact column → colour is read from THIS cell, not by code search
        is_common: false,
        event_kind: 'class',
      })
    }
  }

  return results
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

// Parse "Tuesday, 9 June, 2026" / "9 Jun 2026" → "2026-06-09". Returns '' if unparseable.
// Built string-wise (no Date object) to avoid timezone shifts.
function parseFullDate(dateStr: string): string {
  const m = dateStr.match(/(\d{1,2})\s*[-/ ]?\s*([A-Za-z]{3,})[,\s]+(\d{4})/)
  if (!m) return ''
  const day = m[1].padStart(2, '0')
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()]
  const year = m[3]
  if (!month) return ''
  return `${year}-${month}-${day}`
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
  event_kind: 'class' | 'exam' | 'common'
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
