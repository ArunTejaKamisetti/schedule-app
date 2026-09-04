// The current term's calendar window — Term V, PGP 29 / FIN 06 / LSM 06 (AY 2026-27).
//
// This is the ONE place the term's dates live. The Home page builds its day-selector rail from
// TERM_DATES, so a stale window here leaves Home stranded in the previous term even though the
// schedule page (which derives its week from today's date) has already moved on.
//
// CHANGE THESE TWO LINES EACH TERM, alongside the sheet id — see the term-rollover checklist.
// TERM_START is the first day the schedule sheet carries (Term V opens with the 4-5 Sep
// registration weekend); TERM_END is its last, the final end-term examination day.
export const TERM_START = '2026-09-04'
export const TERM_END = '2026-12-03'

// Local-timezone ISO date. Deliberately NOT toISOString() — that converts to UTC and shifts the
// date by a day for anyone east of Greenwich, which is everyone using this app.
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Every ISO date across the term, in order. Built by stepping a local Date so DST / timezone
// never drops or duplicates a day.
export const TERM_DATES: string[] = (() => {
  const out: string[] = []
  const [y, m, d] = TERM_START.split('-').map(Number)
  const end = TERM_END
  const cur = new Date(y, m - 1, d)
  for (let iso = localISO(cur); iso <= end; iso = localISO(cur)) {
    out.push(iso)
    cur.setDate(cur.getDate() + 1)
  }
  return out
})()
