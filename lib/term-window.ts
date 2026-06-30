import { addDays, parseISO } from 'date-fns'

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

// The inclusive list of ISO dates for the Today date-rail. The window FOLLOWS THE UPLOADED SCHEDULE:
// it runs from a few days before the earliest session to a few days after the latest, so a 1st-year
// and a 2nd-year each track their own sheet instead of one hardcoded term. When there are no sessions
// yet (fresh deploy / roster not applied), it falls back to a window centred on today so the rail is
// never empty. Pure + string-based (no TZ drift) so it's unit-tested.
export function termDates(
  sessionDates: Iterable<string | null | undefined>,
  todayISO: string,
  padDays = 3,
  fallbackSpan = 14,
): string[] {
  const valid = [...sessionDates].filter((d): d is string => !!d && ISO_RE.test(d)).sort()

  let startISO: string
  let endISO: string
  if (valid.length === 0) {
    startISO = localISO(addDays(parseISO(todayISO), -fallbackSpan))
    endISO = localISO(addDays(parseISO(todayISO), fallbackSpan))
  } else {
    startISO = localISO(addDays(parseISO(valid[0]), -padDays))
    endISO = localISO(addDays(parseISO(valid[valid.length - 1]), padDays))
  }

  const out: string[] = []
  let d = parseISO(startISO)
  const end = parseISO(endISO)
  while (d <= end) {
    out.push(localISO(d))
    d = addDays(d, 1)
  }
  return out
}
