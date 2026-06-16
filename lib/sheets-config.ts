// Developer-friendly source list: to add a year/section, add ONE entry here with the
// view-access Google Sheet id. Nothing else in the code needs to change.
//
// `scheduleTab`/`detailsTab` are optional — by default the sync auto-detects them by name
// (the tab matching /schedule/i and /course detail/i). So when the term tab is renamed each
// term (Term IV → Term V Schedule), there is no code change.
//
// `layout`:
//   'division' — 2nd-year style, section header is a division code like D1/E2; room = the code.
//   'section'  — 1st-year style, section header is "Sec A".."Sec H"; room = the cell above it.

export interface SheetSource {
  key: string                       // stable id, e.g. 'y2' | 'y1-AH' | 'y1-LSM' | 'y1-FIN'
  year: 1 | 2
  sheetId: string                   // view-access sheet id (not a secret)
  layout: 'division' | 'section'
  scheduleTab?: string              // optional override; else auto-detected
  detailsTab?: string
}

export const SHEET_SOURCES: SheetSource[] = [
  { key: 'y2', year: 2, sheetId: process.env.GOOGLE_SHEET_ID ?? '', layout: 'division' },
  { key: 'y1-AH', year: 1, sheetId: '15yrTywIp6s-64fBpghqdSpW2rqVQpJYStVSEIpTn0_I', layout: 'section' },
  // When those sheets exist, just add:
  // { key: 'y1-LSM', year: 1, sheetId: '<id>', layout: 'section' },
  // { key: 'y1-FIN', year: 1, sheetId: '<id>', layout: 'section' },
]

// All 1st-year sections the picker should offer (data may not exist yet → "Ask Developer…").
export const YEAR1_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'LSM', 'FIN'] as const
