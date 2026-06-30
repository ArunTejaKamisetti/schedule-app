import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getOrCreateUser } from '@/lib/user'
import { applyRosterOnSignIn } from '@/lib/roster'
import { NotEnrolledError } from '@/lib/access'
import { emailDomainAllowed, isAdminEmail, parseAdminEmails } from '@/lib/auth'
import { getGoogleConfig } from '@/lib/google-auth'

// The college email domain that may sign in. Required + validated at boot (lib/env.ts), so there is
// no institution-specific fallback here — an empty value safely denies everyone rather than letting
// a hardcoded domain through.
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || ''

// Google → Supabase → here. Exchanges the OAuth code for a session, enforces the
// college email domain server-side, then ensures the app user row exists.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/today'

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=auth`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Domain gate — defense beyond the Google `hd` hint (which is spoofable).
  if (!user || !emailDomainAllowed(user.email, ALLOWED_DOMAIN)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/sign-in?error=domain`)
  }

  // Create/refresh the app user — UNLESS they aren't on the roster (and aren't an admin), in which
  // case getOrCreateUser refuses and we bounce them to sign-in with a clear message rather than
  // creating a ghost row. Mirrors the proxy/API roster gate (lib/access.ts).
  try {
    await getOrCreateUser(user.id, user.email ?? null)
  } catch (err) {
    if (err instanceof NotEnrolledError) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/sign-in?error=not_enrolled`)
    }
    throw err
  }
  // Re-apply the roster on EVERY sign-in (idempotent) — so a student who signed in BEFORE their
  // roster was uploaded gets auto-filled on their next login, not only at upload time.
  await applyRosterOnSignIn(createServiceClient(), user.id, user.email ?? null).catch(() => {})

  // One-time Google Sheets authorization for admins: if the app's Google client is configured but no
  // admin has granted sheet access yet, send this admin through the consent once. After that the
  // stored token covers all sync (on-demand + cron), so this redirect never fires again.
  if (isAdminEmail(user.email ?? null, parseAdminEmails(process.env.ADMIN_EMAILS))) {
    const cfg = await getGoogleConfig().catch(() => null)
    if (cfg?.clientId && cfg.clientSecret && !cfg.refreshToken) {
      return NextResponse.redirect(`${origin}/api/admin/oauth`)
    }
  }
  return NextResponse.redirect(`${origin}${next}`)
}
