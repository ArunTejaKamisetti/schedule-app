// Source REGISTRY: the stable set of schedule "slots" (year + layout). The actual Google Sheet id
// for each is admin-pasted per term and stored in the DB (`schedule_sources`, migration 019) — so a
// new term's sheet needs NO code/env change; see lib/schedule-sources.ts#resolveSheetSources. The
// optional `sheetId` here is only a static FALLBACK used until an admin pastes a link.
//
// To add a year/section, add ONE entry below (key/year/layout). Then the admin pastes its link.
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
  sheetId?: string                  // resolved from DB (admin-pasted); static value here is a fallback
  layout: 'division' | 'section'
  scheduleTab?: string              // optional override; else auto-detected
  detailsTab?: string
}

export const SHEET_SOURCES: SheetSource[] = [
  { key: 'y2', year: 2, layout: 'division' },
  { key: 'y1-AH', year: 1, sheetId: '15yrTywIp6s-64fBpghqdSpW2rqVQpJYStVSEIpTn0_I', layout: 'section' },
  // When those sections exist, just add (the admin then pastes each one's link):
  // { key: 'y1-LSM', year: 1, layout: 'section' },
  // { key: 'y1-FIN', year: 1, layout: 'section' },
]

// All 1st-year sections the picker should offer (data may not exist yet → "Ask Developer…").
export const YEAR1_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'LSM', 'FIN'] as const
