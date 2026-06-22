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
//
// Deliberately NOT here (the app boots and runs without them):
//   • Google (CLIENT_ID/SECRET/REDIRECT_URI/SHEET_ID/REFRESH_TOKEN) — sheet reading is configured at
//     runtime via the DB (`google_integration` + admin-pasted `schedule_sources`), not env.
//   • VAPID (PUBLIC/PRIVATE/EMAIL) — web push is optional; without keys the push UI is hidden and
//     send is skipped (lib/notify.ts guards before use).
export const REQUIRED_SERVER_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ALLOWED_EMAIL_DOMAIN',
  'ADMIN_EMAILS',
  'CRON_SECRET',
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
