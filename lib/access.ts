// Roster-gated app access. The roster (both years) is the authoritative list of current students;
// a signed-in non-admin who isn't on it has left or was never enrolled and must be denied — and
// never silently re-created (the bug where a pruned student who stayed logged in reappeared in the
// DB and kept showing up under admin "Review & remove"). The DB predicate is `has_roster_access`
// (migration 023); the admin allowance is applied here because admin emails are env-driven.
import { isAdminEmail, normalizeEmail, parseAdminEmails } from './auth'

// Minimal structural type for whichever supabase client the caller passes (service client for the
// server gate; the RPC is SECURITY DEFINER so a cookie client would work too).
interface AccessClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

// Thrown when a domain-valid, signed-in account is NOT allowed to use the app (not on the roster and
// not an admin). The auth callback and /api/user translate this into sign-out + a clear message;
// getOrCreateUser throws it instead of (re)creating the user row.
export class NotEnrolledError extends Error {
  constructor() {
    super('not_enrolled')
    this.name = 'NotEnrolledError'
  }
}

// Whether a signed-in user may use the app. Admins always may; everyone else must be on the current
// roster (has_roster_access). Fail-OPEN on any RPC error (e.g. the migration isn't applied yet) so a
// transient DB problem can never lock the whole institution out.
export async function hasAppAccess(supabase: AccessClient, email: string | null | undefined): Promise<boolean> {
  const e = normalizeEmail(email)
  if (!e) return false
  if (isAdminEmail(e, parseAdminEmails(process.env.ADMIN_EMAILS))) return true
  const { data, error } = await supabase.rpc('has_roster_access', { p_email: e })
  if (error) return true
  return data === true
}
