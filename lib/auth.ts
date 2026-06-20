// Pure auth helpers — no DB / network, so they're fast to unit-test
// (see tests/auth.test.ts). The route handlers / proxy wire these up.

const PUBLIC_PREFIXES = ['/sign-in', '/auth']

export function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase()
}

// True only if the email belongs exactly to the allowed college domain
// (e.g. "iimk.ac.in"). Case-insensitive; a leading "@" on the domain is tolerated.
export function emailDomainAllowed(
  email: string | null | undefined,
  allowedDomain: string
): boolean {
  const e = normalizeEmail(email)
  const d = allowedDomain.trim().toLowerCase().replace(/^@/, '')
  if (!e || !d || !e.includes('@')) return false
  return e.endsWith('@' + d)
}

// Parse the comma-separated ADMIN_EMAILS env value into a normalized list.
export function parseAdminEmails(csv: string | null | undefined): string[] {
  return (csv ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(
  email: string | null | undefined,
  adminEmails: string[]
): boolean {
  const e = normalizeEmail(email)
  return e.length > 0 && adminEmails.includes(e)
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export type RouteAction = 'allow' | 'to-sign-in' | 'to-home'

// What the proxy should do for a given path + auth state.
// API routes enforce their own auth (and must return JSON, not a redirect),
// so they're always allowed through here.
export function authRouteAction(pathname: string, isAuthed: boolean): RouteAction {
  if (pathname.startsWith('/api')) return 'allow'
  if (!isAuthed && !isPublicPath(pathname)) return 'to-sign-in'
  if (isAuthed && pathname === '/sign-in') return 'to-home'
  return 'allow'
}
