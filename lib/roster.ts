import { createServiceClient } from './supabase/server'
import { normalizeEmail } from './auth'
import { aliasToScheduleCode } from './sheets'
import { loadInstitutionProfile } from './institution-profile'
import type { Year1RosterEntry, Year2RosterEntry } from './roster-parse'

type SB = ReturnType<typeof createServiceClient>

// Store roster rows (authoritative per YEAR — see upsertAndApply) and immediately apply to any
// students who have ALREADY signed in. Students who sign in later get applied on sign-in
// (lib/user.ts → applyRosterOnSignIn), so upload order vs sign-in order doesn't matter.
export async function storeYear1Roster(supabase: SB, entries: Year1RosterEntry[]) {
  const rows = entries.map((e) => ({ email: e.email, year: 1, section: e.section, codes: [] }))
  return upsertAndApply(supabase, rows)
}

export async function storeYear2Roster(supabase: SB, entries: Year2RosterEntry[]) {
  // Map each enrolment code onto the SCHEDULE's code via the catalog alias (e.g. a roster "RM" → the
  // schedule's "RTM"; a roster that already wrote "RTM" is unchanged), so it matches the course_code
  // the schedule stores/shows. The default profile already carries the IIM-K aliases (works pre-config).
  const profile = await loadInstitutionProfile(supabase)
  const aliases = profile.catalog.aliases
  const rows = entries.map((e) => ({
    email: e.email, year: 2, section: null,
    codes: e.codes.map((c) => aliasToScheduleCode(c, aliases, profile)),
  }))
  return upsertAndApply(supabase, rows)
}

type RosterRow = { email: string; year: number; section: string | null; codes: string[] }

async function upsertAndApply(supabase: SB, rows: RosterRow[]): Promise<{ stored: number; applied: number }> {
  if (rows.length === 0) return { stored: 0, applied: 0 } // an empty file never clears a year (safety)

  // Authoritative: REPLACE this year's entire roster slice atomically (emails no longer listed are
  // dropped), so `roster` always reflects exactly the current students. All rows share one year.
  const year = rows[0].year
  const payload = rows.map((r) => ({ email: r.email, section: r.section, codes: r.codes }))
  const { error } = await supabase.rpc('replace_roster_year', { p_year: year, p_rows: payload })
  if (error) throw new Error(`Roster replace failed: ${error.message}`)

  // Apply to already-registered users (emails stored lowercase since getOrCreateUser normalizes).
  const emails = rows.map((r) => r.email)
  const { data: users } = await supabase.from('users').select('id, email').in('email', emails)
  let applied = 0
  for (const u of (users ?? []) as { id: string; email: string | null }[]) {
    const { error: e } = await supabase.rpc('apply_roster_to_user', { p_user: u.id, p_email: u.email })
    if (!e) applied++
  }
  return { stored: rows.length, applied }
}

// Called once on sign-in (after the users row exists): apply this student's roster, if any.
// Best-effort — a missing roster row is a no-op (the RPC returns early).
export async function applyRosterOnSignIn(supabase: SB, userId: string, email: string | null): Promise<void> {
  const e = normalizeEmail(email)
  if (!e) return
  await supabase.rpc('apply_roster_to_user', { p_user: userId, p_email: e })
}
