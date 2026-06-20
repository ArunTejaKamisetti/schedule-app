import { createClient } from './supabase/server'
import { isAdminEmail, parseAdminEmails } from './auth'

// Server-only admin gate for admin API routes. Reads the SIGNED-IN user from the cookie-aware
// client (so it can't be spoofed by a body param) and checks them against the ADMIN_EMAILS
// allowlist. Returns the admin email, or null if the caller isn't an admin.
//
// NOTE: admin routes that previously had no auth (sync trigger, preview, oauth) should adopt this.
export async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email ?? null
  return isAdminEmail(email, parseAdminEmails(process.env.ADMIN_EMAILS)) ? email : null
}
