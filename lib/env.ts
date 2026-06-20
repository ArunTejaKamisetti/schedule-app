// Fail-fast environment validation.
//
// WHY: secrets/config are spread across many modules that each did `process.env.X!` — a missing
// or typo'd var surfaced as a confusing runtime null deep inside a request. This validates the
// whole required set ONCE at server startup (wired from `instrumentation.ts`) so a misconfigured
// deploy fails immediately with a clear, aggregated message instead of a 500 mid-request.
//
// Pure and side-effect-free apart from `assertServerEnv()` throwing — `validateEnv()` takes the
// source map explicitly so it is unit-testable without mutating the real environment.

// Server-only vars the app cannot run without. NEXT_PUBLIC_* are validated too (they must exist at
// build time for the client bundle, but a missing one at runtime is still worth catching early).
export const REQUIRED_SERVER_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ALLOWED_EMAIL_DOMAIN',
  'ADMIN_EMAILS',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_SHEET_ID',
  'GOOGLE_REFRESH_TOKEN',
  'CRON_SECRET',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_EMAIL',
  'NEXT_PUBLIC_APP_URL',
] as const

export type RequiredEnvVar = (typeof REQUIRED_SERVER_ENV)[number]

type EnvSource = Record<string, string | undefined>

// Returns the names of every required var that is missing or blank in `source`.
export function validateEnv(source: EnvSource = process.env): RequiredEnvVar[] {
  return REQUIRED_SERVER_ENV.filter((key) => {
    const v = source[key]
    return v === undefined || v.trim() === ''
  })
}

// Throws a single aggregated error if any required var is missing. Call once at startup.
export function assertServerEnv(source: EnvSource = process.env): void {
  const missing = validateEnv(source)
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set them in .env.local (dev) or the deploy env (prod) — see .env.example.`
    )
  }
}
