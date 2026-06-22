// Extract a Google Sheets spreadsheet id from whatever the admin pastes — a full share link
// (`https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0`), a bare id, or surrounding whitespace.
// Pure + side-effect-free so the paste route can validate before touching the DB, and so it's
// unit-testable. Returns the id, or null if nothing id-shaped is found.
//
// A Drive file id is `[A-Za-z0-9_-]+` (letters, digits, dash, underscore), typically ~44 chars but
// we don't hard-code a length. We accept either `/d/<ID>` from a URL or a standalone token.
export function parseSheetId(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // Full/partial URL form: …/spreadsheets/d/<ID>/… (also matches /d/<ID> without /edit).
  const fromUrl = trimmed.match(/\/d\/([A-Za-z0-9_-]+)/)
  if (fromUrl) return fromUrl[1]

  // Bare id (no slashes, no spaces) — accept as-is.
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed

  return null
}
