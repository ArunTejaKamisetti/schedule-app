// The Institution Profile — the per-deployment VOCABULARY of schedule change-tracking that used to
// be hardcoded for IIM Kozhikode. The change-tracking LOGIC (diff.ts: moved/rescheduled/room/
// added/removed from slot structure) is institution-agnostic and lives elsewhere; this is only the
// vocabulary the parser/classifier needs:
//   • colors    — which fill colour means cancelled / added / event (and how to match it)
//   • catalog   — cross-sheet course aliases (a code that differs schedule-vs-roster, or a venue cell)
//   • sections  — section labels, section-header prefix, division-code shape
//   • keywords  — words that mark a row to skip (lunch/break) or treat as a common event (exam)
//
// `DEFAULT_PROFILE` holds the current IIM-K values so every pure function keeps its old behaviour
// when called without a profile (all existing tests + a pre-config deployment). An admin overrides
// any concern from the Institution Profile dashboard; `loadInstitutionProfile` merges those DB rows
// over the defaults. A forked deployment (IIM-C/B) edits these in the dashboard — no redeploy.
//
// Persisted per-concern as rows in `institution_profile` (migration 021), keyed by the top-level
// field name ('colors' | 'catalog' | 'sections' | 'overrides' | 'keywords') — same shape as
// site_content (bus/mess).

export type ColorMode = 'auto' | 'custom'

export interface ColorRules {
  // 'auto'   → the built-in channel-dominance heuristic (robust to ANY shade of red/green/amber);
  //            this is what IIM-K uses today, so it stays the default.
  // 'custom' → match each cell against the institution's DECLARED swatches by perceptual distance
  //            (closest bucket within `tolerance`, else normal). For institutions whose colour
  //            conventions differ from red/green/amber.
  mode: ColorMode
  cancelled: string[]   // hex swatches, e.g. ['#ff0000'] (custom mode)
  added: string[]
  event: string[]
  tolerance: number     // 0..1 max perceptual distance to count as a match (custom mode)
}

export interface CatalogConfig {
  // Schedule code → its canonical (roster / Course-Details) code. Handles two cases with one map:
  //   • a plain code alias (single-token key): 'RTM' → 'RM' (also covers 'RTM-A' → 'RM-A'). The
  //     schedule keeps its own code for display; the roster's form maps onto it (aliasToScheduleCode).
  //   • a venue / whole-cell alias (multi-word key): 'YMHC MN Common Room' → 'YMHC'. The parser
  //     stores the real code ('YMHC') so the class matches the roster's 'YMHC' no matter when the
  //     alias was added, but DISPLAYS the cell verbatim ('YMHC MN Common Room') and leaves the room to
  //     the section/division column (normalizeScheduleCode).
  // Matching is case- and whitespace-insensitive.
  aliases: Record<string, string>
}

export interface SectionConfig {
  sectionLabels: string[]       // 1st-year section labels — single OR multi-char, e.g. ['A'..'H','FIN','LSM']
  sectionHeaderPrefix: string   // the word before the section label in the header, e.g. 'Sec'
  divisionCodePattern: string   // regex (source) identifying a 2nd-year division code, e.g. D1/E2
  // Where a 1st-year sheet carries the SECTION identity (the thing a student is rostered into):
  //   'column' — legacy: a "Sec A".."Sec H" header row; the COLUMN is the section, the cell is the
  //              bare course code, the room is the classroom cell above the header.
  //   'cell'   — new format: classroom-only headers (no "Sec X" row); each cell is
  //              "<COURSE><sep><SECTION>" (e.g. "DA-B", "ME-Fin"), so the SECTION lives in the cell
  //              and the COLUMN is a room. A section is no longer tied to one column.
  //   'auto'   — detect per sheet: a section-header row → 'column', else a room-header row → 'cell'.
  sectionSource: 'auto' | 'column' | 'cell'
  cellSectionSeparator: string  // splits course from section in a 'cell'-mode cell, e.g. '-' in "ME-Fin"
  roomHeaderPattern: string     // regex (source) identifying a classroom header cell, e.g. "CR A1"/"MDC C6"
}

export interface KeywordConfig {
  skipWords: string[]   // a row whose time/code matches one of these is filler (lunch, break…)
  eventWords: string[]  // text matching one of these is a common event for everyone (exam, viva…)
}

export interface InstitutionProfile {
  colors: ColorRules
  catalog: CatalogConfig
  sections: SectionConfig
  keywords: KeywordConfig
}

// ── Default profile = the current IIM-K vocabulary (built-in fallback) ───────────────────────────

export const DEFAULT_PROFILE: InstitutionProfile = {
  colors: { mode: 'auto', cancelled: ['#ff0000'], added: ['#00ff00'], event: ['#ffc000'], tolerance: 0.25 },
  catalog: {
    aliases: { RTM: 'RM' },
  },
  sections: {
    // IIM-K 1st-year sections: the eight PGP letters plus the FIN/LSM programme cohorts, which appear
    // as section tags in the merged "PGP30/FIN07/LSM07" sheet (e.g. "ME-Fin", "BC-LSM"). Multi-char
    // labels are first-class — nothing here (or downstream) assumes a section is one letter.
    sectionLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'FIN', 'LSM'],
    sectionHeaderPrefix: 'Sec',
    // Single letter + digits (D1/E2) — strict enough to NOT match the programme-name row above the
    // section header (e.g. PGPFIN06), which is how the section-header row is located.
    divisionCodePattern: '^[A-Z]\\d+$',
    sectionSource: 'auto',
    cellSectionSeparator: '-',
    // Classroom headers in the section-in-cell sheet: "CR A1", "MDC C6", …
    roomHeaderPattern: '^(CR|MDC)\\b',
  },
  keywords: {
    skipWords: ['lunch', 'break', 'registration', 'holiday', 'recess', 'tea', 'meeting'],
    eventWords: ['exam', 'mid term', 'end term', 'quiz', 'viva'],
  },
}

// ── Pure helpers (no DB, no imports — unit-tested) ───────────────────────────────────────────────

// Normalised substring keyword match (e.g. "MID TERM" matches a "mid term" rule). Used for both
// skip and event keyword lists so admins can type "mid term" / "end-term" interchangeably.
export function matchesKeyword(text: string, words: string[]): boolean {
  const t = (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  for (const w of words) {
    const n = (w || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    if (n && t.includes(n)) return true
  }
  return false
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// '^Sec\s+(A|B|…)$' (case-insensitive). The capture group is the section label.
export function sectionHeaderRegex(cfg: SectionConfig): RegExp {
  const prefix = escapeRe(cfg.sectionHeaderPrefix || 'Sec')
  const labels = (cfg.sectionLabels.length ? cfg.sectionLabels : ['A']).map(escapeRe).join('|')
  return new RegExp(`^${prefix}\\s+(${labels})$`, 'i')
}

// Compile the admin's division-code pattern; fall back to the default if it's not a valid regex
// (so a typo in the dashboard can never crash the sync).
export function divisionCodeRegex(cfg: SectionConfig): RegExp {
  try {
    return new RegExp(cfg.divisionCodePattern)
  } catch {
    return /^[A-Z]+\d+$/
  }
}

// The section labels as a regex alternation, LONGEST-FIRST + escaped — so a multi-char label ("FIN",
// "LSM") wins over a single-char one ("F") when both could match. The shared building block for every
// label-driven matcher below, so nothing has to assume a section is one character.
function labelAlternation(cfg: SectionConfig): string {
  const labels = cfg.sectionLabels.length ? cfg.sectionLabels : ['A']
  return labels.slice().sort((a, b) => b.length - a.length).map(escapeRe).join('|')
}

// A schedule cell in a 'cell'-mode sheet: "<COURSE><sep><SECTION>" (e.g. "ME-Fin", "DA-B", "BC-LSM").
// Group 1 = the course code, group 2 = a DECLARED section label. Case-insensitive; the anchored end +
// declared-label alternation stop a course code that merely contains the separator from mis-splitting.
export function cellSectionRegex(cfg: SectionConfig): RegExp {
  const sep = escapeRe(cfg.cellSectionSeparator || '-')
  return new RegExp(`^(.+?)\\s*${sep}\\s*(${labelAlternation(cfg)})$`, 'i')
}

// A classroom/room header cell (e.g. "CR A1", "MDC C6") — the column identity in a 'cell'-mode sheet.
// Compiled from the admin pattern; a bad regex falls back to a permissive room-ish default so the sync
// can't crash on a dashboard typo.
export function roomHeaderRegex(cfg: SectionConfig): RegExp {
  try {
    return new RegExp(cfg.roomHeaderPattern || '(?:)', 'i')
  } catch {
    return /^(CR|MDC)\b/i
  }
}

// Remove a trailing "-<section>" marker, generic over the declared labels: "GT-A"→"GT",
// "ME-Fin"→"ME", "DS-A(LSM-Core)"→"DS(LSM-Core)". Only a DECLARED label that sits right before a "("
// or the end is stripped (so "LSM-Core" is left intact). Global + case-insensitive.
export function sectionSuffixRegex(cfg: SectionConfig): RegExp {
  return new RegExp(`-(?:${labelAlternation(cfg)})(?=\\(|$)`, 'gi')
}

// Parse a Course-Details "Section Allocation" cell into its section labels — generic over ANY label
// set. Handles "All", concatenated single letters ("AB"→['A','B']) and separated multi-char labels
// ("A, Fin"→['A','FIN']). Longest-label-first so "Fin" is read as one section, never F/I/N.
export function parseSectionAlloc(alloc: string, labels: string[]): string[] {
  const up = (alloc || '').toUpperCase()
  const all = (labels.length ? labels : ['A']).map((l) => l.toUpperCase())
  if (/all/i.test(alloc || '')) return [...new Set(all)]
  const ordered = all.slice().sort((a, b) => b.length - a.length).filter(Boolean)
  const found: string[] = []
  for (let i = 0; i < up.length;) {
    const hit = ordered.find((l) => up.startsWith(l, i))
    if (hit) { found.push(hit); i += hit.length } else i += 1 // skip separators / stray chars
  }
  return [...new Set(found)]
}

// ── Closest-bucket colour matcher (custom mode) ──────────────────────────────────────────────────

function toRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || '').trim())
  if (!m) return null
  const n = m[1]
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) }
}

// Perceptual-ish distance in 0..~1 between two hex colours ("redmean" weighting — cheap, no deps,
// noticeably better than plain RGB Euclid for reds/greens). Returns Infinity if either is unparseable.
export function colorDistance(a: string, b: string): number {
  const A = toRgb(a), B = toRgb(b)
  if (!A || !B) return Infinity
  const rmean = (A.r + B.r) / 2
  const dr = A.r - B.r, dg = A.g - B.g, db = A.b - B.b
  const d = Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db)
  return d / 765
}

// Classify a hex against an institution's DECLARED swatches: the nearest swatch across all buckets,
// if within `tolerance`, wins; otherwise 'normal'. Buckets map cancelled→red, added→green, event→event
// to match the states the rest of the pipeline already understands.
export function classifyBySwatches(hex: string, rules: ColorRules): 'red' | 'green' | 'event' | 'normal' {
  const buckets: [('red' | 'green' | 'event'), string[]][] = [
    ['red', rules.cancelled], ['green', rules.added], ['event', rules.event],
  ]
  let best: { state: 'red' | 'green' | 'event' | 'normal'; d: number } = { state: 'normal', d: Infinity }
  for (const [state, swatches] of buckets) {
    for (const sw of swatches ?? []) {
      const d = colorDistance(hex, sw)
      if (d < best.d) best = { state, d }
    }
  }
  const tol = typeof rules.tolerance === 'number' ? rules.tolerance : 0.25
  return best.d <= tol ? best.state : 'normal'
}

// ── Merge + load ─────────────────────────────────────────────────────────────────────────────────

// Minimal structural type for the supabase client (avoids importing server-only supabase into this
// otherwise-pure module — the caller passes its service client, like resolveSheetSources does).
interface ProfileDbClient {
  from(table: string): {
    select(columns: string): PromiseLike<{ data: { key: string; data: unknown }[] | null; error: unknown }>
  }
}

export type ProfilePatch = Partial<{
  colors: Partial<ColorRules>
  catalog: Partial<CatalogConfig>
  sections: Partial<SectionConfig>
  keywords: Partial<KeywordConfig>
}>

// The persistable concerns (= top-level profile keys = `institution_profile.key` values).
export const PROFILE_KEYS = ['colors', 'catalog', 'sections', 'keywords'] as const
export type ProfileKey = (typeof PROFILE_KEYS)[number]

// Merge admin overrides (per concern) over the defaults. Object concerns are field-merged so a
// partial row still works.
export function mergeProfile(base: InstitutionProfile, patch: ProfilePatch): InstitutionProfile {
  return {
    colors: { ...base.colors, ...(patch.colors ?? {}) },
    catalog: { ...base.catalog, ...(patch.catalog ?? {}) },
    sections: { ...base.sections, ...(patch.sections ?? {}) },
    keywords: { ...base.keywords, ...(patch.keywords ?? {}) },
  }
}

// Turn the per-concern `institution_profile` rows into a single patch object.
export function rowsToPatch(rows: { key: string; data: unknown }[] | null | undefined): ProfilePatch {
  const patch: Record<string, unknown> = {}
  for (const r of rows ?? []) patch[r.key] = r.data
  return patch as ProfilePatch
}

// The effective profile = defaults with any saved concern rows merged on top. Any read error
// (table missing pre-migration, transient failure) falls back to the built-in defaults.
export async function loadInstitutionProfile(supabase: ProfileDbClient): Promise<InstitutionProfile> {
  try {
    const { data } = await supabase.from('institution_profile').select('key, data')
    return mergeProfile(DEFAULT_PROFILE, rowsToPatch(data))
  } catch {
    return DEFAULT_PROFILE
  }
}

// ── Sanitisation (admin input → safe patch) ──────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []
}

// String→string map, dropping blank/non-string entries.
function strRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (isRecord(v)) {
    for (const [k, val] of Object.entries(v)) {
      const key = k.trim()
      if (key && typeof val === 'string' && val.trim()) out[key] = val.trim()
    }
  }
  return out
}

const HEX = /^#?[0-9a-fA-F]{6}$/
function hexArray(v: unknown): string[] {
  return strArray(v).filter((s) => HEX.test(s)).map((s) => (s.startsWith('#') ? s : `#${s}`).toLowerCase())
}

// Coerce arbitrary request JSON into a safe ProfilePatch: only known concerns/fields, correct types,
// hex-validated colours, a compilable division pattern. Anything malformed is dropped (never throws),
// so a bad dashboard payload can't corrupt the profile or crash the sync that reads it.
export function sanitizeProfilePatch(input: unknown): ProfilePatch {
  if (!isRecord(input)) return {}
  const patch: ProfilePatch = {}

  if (isRecord(input.colors)) {
    const c = input.colors
    const mode: ColorMode = c.mode === 'custom' ? 'custom' : 'auto'
    const tol = typeof c.tolerance === 'number' && c.tolerance >= 0 && c.tolerance <= 1 ? c.tolerance : DEFAULT_PROFILE.colors.tolerance
    patch.colors = { mode, cancelled: hexArray(c.cancelled), added: hexArray(c.added), event: hexArray(c.event), tolerance: tol }
  }

  if (isRecord(input.catalog)) {
    patch.catalog = { aliases: strRecord(input.catalog.aliases) }
  }

  if (isRecord(input.sections)) {
    const s = input.sections
    let divisionCodePattern = typeof s.divisionCodePattern === 'string' ? s.divisionCodePattern.trim() : ''
    try { new RegExp(divisionCodePattern || '(?:)') } catch { divisionCodePattern = '' } // reject an uncompilable regex
    let roomHeaderPattern = typeof s.roomHeaderPattern === 'string' ? s.roomHeaderPattern.trim() : ''
    try { new RegExp(roomHeaderPattern || '(?:)') } catch { roomHeaderPattern = '' } // reject an uncompilable regex
    const sectionSource: SectionConfig['sectionSource'] =
      s.sectionSource === 'column' || s.sectionSource === 'cell' ? s.sectionSource : 'auto'
    const cellSectionSeparator =
      typeof s.cellSectionSeparator === 'string' && s.cellSectionSeparator.trim()
        ? s.cellSectionSeparator.trim() : DEFAULT_PROFILE.sections.cellSectionSeparator
    patch.sections = {
      sectionLabels: strArray(s.sectionLabels).map((l) => l.toUpperCase()),
      sectionHeaderPrefix: typeof s.sectionHeaderPrefix === 'string' ? s.sectionHeaderPrefix.trim() : DEFAULT_PROFILE.sections.sectionHeaderPrefix,
      divisionCodePattern: divisionCodePattern || DEFAULT_PROFILE.sections.divisionCodePattern,
      sectionSource,
      cellSectionSeparator,
      roomHeaderPattern: roomHeaderPattern || DEFAULT_PROFILE.sections.roomHeaderPattern,
    }
  }

  if (isRecord(input.keywords)) {
    patch.keywords = { skipWords: strArray(input.keywords.skipWords), eventWords: strArray(input.keywords.eventWords) }
  }

  return patch
}

// Persist a sanitised patch: one upsert row per concern present. Returns the keys written.
export async function saveProfilePatch(
  supabase: { from(t: string): { upsert(rows: unknown, opts: unknown): PromiseLike<{ error: unknown }> } },
  patch: ProfilePatch,
  updatedBy?: string,
): Promise<ProfileKey[]> {
  const now = new Date().toISOString()
  const rows = (Object.keys(patch) as ProfileKey[])
    .filter((k) => PROFILE_KEYS.includes(k))
    .map((key) => ({ key, data: patch[key], updated_at: now, updated_by: updatedBy ?? null }))
  if (rows.length === 0) return []
  const { error } = await supabase.from('institution_profile').upsert(rows, { onConflict: 'key' })
  if (error) throw new Error(typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : 'save failed')
  return rows.map((r) => r.key)
}
