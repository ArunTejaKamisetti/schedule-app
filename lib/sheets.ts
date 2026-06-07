import { google } from 'googleapis'
import type { RawSheetData } from './types'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

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
    ranges: ['Sheet1', 'Sheet2'],
    valueRenderOption: 'FORMATTED_VALUE',
  })

  const [sheet1Response, sheet2Response] = response.data.valueRanges ?? []

  return {
    sheet1: (sheet1Response?.values as string[][]) ?? [],
    sheet2: (sheet2Response?.values as string[][]) ?? [],
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

// Parse raw rows into structured course objects
// Detects columns dynamically from header row
export function parseSheetRows(
  rows: string[][],
  sheetTab: string
): ParsedCourse[] {
  if (!rows || rows.length < 2) return []

  const header = rows[0].map((h) => h.toLowerCase().trim())

  const colIndex = {
    code: findCol(header, ['code', 'course code', 'subject code', 'course_code']),
    name: findCol(header, ['name', 'course name', 'subject', 'title', 'course_name']),
    instructor: findCol(header, ['instructor', 'faculty', 'teacher', 'professor', 'staff']),
    day: findCol(header, ['day', 'day of week', 'days', 'weekday']),
    start: findCol(header, ['start', 'start time', 'from', 'begin', 'time start']),
    end: findCol(header, ['end', 'end time', 'to', 'finish', 'time end']),
    room: findCol(header, ['room', 'venue', 'location', 'hall', 'classroom']),
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

    // Handle combined "time" column like "09:00-10:30" or "MON 09:00-10:30"
    if ((!startTime || !endTime) && colIndex.time !== -1) {
      const timeStr = getCell(row, colIndex.time)
      const parsed = parseTimeRange(timeStr)
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
      start_time: normalizeTime(startTime),
      end_time: normalizeTime(endTime),
      room: getCell(row, colIndex.room),
      credits: getCell(row, colIndex.credits),
      sheet_tab: sheetTab,
      sheet_row_index: i,
    })
  }

  return results
}

export interface ParsedCourse {
  course_code: string
  course_name: string
  instructor: string
  day_of_week: string
  start_time: string
  end_time: string
  room: string
  credits: string
  sheet_tab: string
  sheet_row_index: number
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

function normalizeTime(raw: string): string {
  if (!raw) return ''
  // Handle "9:00 AM", "09:00", "9.00", "900" formats
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

function parseTimeRange(raw: string): { start: string; end: string; day?: string } | null {
  if (!raw) return null
  // Matches "09:00-10:30" or "9:00 AM - 10:30 AM" or "MON 09:00-10:30"
  const match = raw.match(
    /(?:(mon|tue|wed|thu|fri|sat|sun)[^0-9]*)?([\d]{1,2}[:.][\d]{2}\s*(?:am|pm)?)[\s\-–—]+([\d]{1,2}[:.][\d]{2}\s*(?:am|pm)?)/i
  )
  if (!match) return null
  return {
    day: match[1] ? match[1].toUpperCase() : undefined,
    start: normalizeTime(match[2]),
    end: normalizeTime(match[3]),
  }
}
