// The Institution Profile — the per-deployment VOCABULARY of schedule change-tracking that used to
// be hardcoded for IIM Kozhikode. The change-tracking LOGIC (diff.ts: moved/rescheduled/room/
// added/removed from slot structure) is institution-agnostic and lives elsewhere; this is only the
// vocabulary the parser/classifier needs:
//   • colors    — which fill colour means cancelled / added / event (and how to match it)
//   • catalog   — course abbreviation → area, cross-sheet aliases, programme qualifiers
//   • sections  — section labels, section-header prefix, division-code shape
//   • overrides — venue/edge-case cells (e.g. "YMHC MN Common Room")
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

export interface QualifierRule {
  contains: string      // matched (whitespace/dash-insensitive) against the course code
  area: string          // the area to assign, e.g. 'FIN Core'
}

export interface CatalogConfig {
  areaMap: Record<string, string>   // base abbreviation → area ('GT' → 'ECO')
  aliases: Record<string, string>   // schedule base abbr → Course-Details base abbr ('RTM' → 'RM')
  qualifiers: QualifierRule[]        // programme qualifiers, checked IN ORDER (Core before plain)
}

export interface SectionConfig {
  sectionLabels: string[]       // 1st-year section letters, e.g. ['A'..'H']
  sectionHeaderPrefix: string   // the word before the section letter in the header, e.g. 'Sec'
  divisionCodePattern: string   // regex (source) identifying a 2nd-year division code, e.g. D1/E2
}

export interface VenueOverride {
  match: string         // when the (cleaned) cell text CONTAINS this (case-insensitive)…
  detailAbbr: string    // …enrich it from this Course-Details abbreviation…
  area?: string         // …and (optionally) force this area. Display keeps the cell's own label.
}

export interface KeywordConfig {
  skipWords: string[]   // a row whose time/code matches one of these is filler (lunch, break…)
  eventWords: string[]  // text matching one of these is a common event for everyone (exam, viva…)
}

export interface InstitutionProfile {
  colors: ColorRules
  catalog: CatalogConfig
  sections: SectionConfig
  overrides: VenueOverride[]
  keywords: KeywordConfig
}

// ── Default profile = the current IIM-K vocabulary (built-in fallback) ───────────────────────────

// From the List of Electives PDF — abbreviation → area.
const DEFAULT_AREA_MAP: Record<string, string> = {
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

export const DEFAULT_PROFILE: InstitutionProfile = {
  colors: { mode: 'auto', cancelled: ['#ff0000'], added: ['#00ff00'], event: ['#ffc000'], tolerance: 0.25 },
  catalog: {
    areaMap: DEFAULT_AREA_MAP,
    aliases: { RTM: 'RM' },
    // Order matters: a Core qualifier must be checked before its plain elective (FIN before FIN…).
    qualifiers: [
      { contains: '(FIN-Core)', area: 'FIN Core' },
      { contains: '(LSM-Core)', area: 'LSM Core' },
      { contains: '(FIN)', area: 'FIN Elective' },
      { contains: '(LSM)', area: 'LSM Elective' },
    ],
  },
  sections: {
    sectionLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    sectionHeaderPrefix: 'Sec',
    // Single letter + digits (D1/E2) — strict enough to NOT match the programme-name row above the
    // section header (e.g. PGPFIN06), which is how the section-header row is located.
    divisionCodePattern: '^[A-Z]\\d+$',
  },
  overrides: [
    // One-off admin data issue: the venue was typed into YMHC's schedule cell. Enrich as the HLAM
    // elective YMHC while the caller keeps the admin's "…Common Room" label for display.
    { match: 'common room', detailAbbr: 'YMHC', area: 'HLAM' },
  ],
  keywords: {
    skipWords: ['lunch', 'break', 'registration', 'holiday', 'recess', 'tea', 'meeting'],
    eventWords: ['exam', 'mid term', 'end term', 'quiz', 'viva'],
  },
}

// ── Pure helpers (no DB, no imports — unit-tested) ───────────────────────────────────────────────

// Lowercase + strip whitespace & dashes, keeping parens/alphanumerics — so "(FIN-Core)",
// "(FIN Core)" and "(fincore)" all compare equal, while a plain "(FIN)" still can't match a code
// that merely contains the letters "fin" (the paren stays significant).
function normForMatch(s: string): string {
  return (s || '').toLowerCase().replace(/[\s-]+/g, '')
}

// First override whose `match` substring appears in the cleaned cell text, else null.
export function matchOverride(code: string, overrides: VenueOverride[]): VenueOverride | null {
  const hay = (code || '').replace(/\s+/g, ' ').trim().toLowerCase()
  for (const o of overrides) {
    const needle = (o.match || '').trim().toLowerCase()
    if (needle && hay.includes(needle)) return o
  }
  return null
}

// The area implied by a programme qualifier (checked in order), or null if none applies.
export function qualifierArea(code: string, qualifiers: QualifierRule[]): string | null {
  const n = normForMatch(code)
  for (const q of qualifiers) {
    const needle = normForMatch(q.contains)
    if (needle && n.includes(needle)) return q.area
  }
  return null
}

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
  overrides: VenueOverride[]
  keywords: Partial<KeywordConfig>
}>

// The persistable concerns (= top-level profile keys = `institution_profile.key` values).
export const PROFILE_KEYS = ['colors', 'catalog', 'sections', 'overrides', 'keywords'] as const
export type ProfileKey = (typeof PROFILE_KEYS)[number]

// Merge admin overrides (per concern) over the defaults. Object concerns are field-merged so a
// partial row still works; `overrides` is an array, so it's replaced wholesale when present.
export function mergeProfile(base: InstitutionProfile, patch: ProfilePatch): InstitutionProfile {
  return {
    colors: { ...base.colors, ...(patch.colors ?? {}) },
    catalog: { ...base.catalog, ...(patch.catalog ?? {}) },
    sections: { ...base.sections, ...(patch.sections ?? {}) },
    overrides: Array.isArray(patch.overrides) ? patch.overrides : base.overrides,
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
    const cat = input.catalog
    const qualifiers = Array.isArray(cat.qualifiers)
      ? cat.qualifiers
          .filter(isRecord)
          .map((q) => ({ contains: String(q.contains ?? '').trim(), area: String(q.area ?? '').trim() }))
          .filter((q) => q.contains && q.area)
      : []
    patch.catalog = { areaMap: strRecord(cat.areaMap), aliases: strRecord(cat.aliases), qualifiers }
  }

  if (isRecord(input.sections)) {
    const s = input.sections
    let divisionCodePattern = typeof s.divisionCodePattern === 'string' ? s.divisionCodePattern.trim() : ''
    try { new RegExp(divisionCodePattern || '(?:)') } catch { divisionCodePattern = '' } // reject an uncompilable regex
    patch.sections = {
      sectionLabels: strArray(s.sectionLabels).map((l) => l.toUpperCase()),
      sectionHeaderPrefix: typeof s.sectionHeaderPrefix === 'string' ? s.sectionHeaderPrefix.trim() : DEFAULT_PROFILE.sections.sectionHeaderPrefix,
      divisionCodePattern: divisionCodePattern || DEFAULT_PROFILE.sections.divisionCodePattern,
    }
  }

  if (Array.isArray(input.overrides)) {
    patch.overrides = input.overrides
      .filter(isRecord)
      .map((o) => {
        const out: VenueOverride = { match: String(o.match ?? '').trim(), detailAbbr: String(o.detailAbbr ?? '').trim() }
        const area = String(o.area ?? '').trim()
        if (area) out.area = area
        return out
      })
      .filter((o) => o.match && o.detailAbbr)
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
