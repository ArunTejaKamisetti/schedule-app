// Ephemeral in-process Postgres (pglite, WASM — no Docker, ₹0, runs in `npm test`) that loads the
// REAL migrations so the business-critical SQL the app depends on — `user_sessions`, the roster
// RPCs, and the RLS policies — is exercised by tests instead of only living in hand-pasted SQL.
//
// Supabase gives us `auth.uid()`, the `authenticated`/`anon`/`service_role` roles, and default
// table grants for free; a bare Postgres has none of them, so a PREAMBLE shims them in before the
// migrations run and a GRANT pass (after, once every table exists) lets the `authenticated` role
// reach tables — so RLS, not a missing GRANT, is what denies a cross-user read.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations', import.meta.url))

// `auth.uid()` reads the JWT subject the way Supabase does (a session GUC), so policies keyed on
// `auth.uid()` resolve to whoever the test is "acting as". Roles are created idempotently.
const PREAMBLE = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon;          END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role;  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
`

// Run AFTER all migrations so every table/sequence/function exists. Gives `authenticated` the base
// privileges Supabase grants by default; RLS still applies on top (the role is non-superuser).
const GRANTS = `
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
`

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort() // zero-padded numeric prefixes sort lexicographically in apply order
}

// Boot a fresh database with the full schema applied. Each call is fully isolated (in-memory).
export async function freshDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(PREAMBLE)
  for (const f of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`migration ${f} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await db.exec(GRANTS)
  return db
}

// Run subsequent queries AS the signed-in student `userId` (RLS enforced — `authenticated` is a
// non-superuser, non-owner role, so policies apply). Mirrors the cookie-aware client.
export async function actAsUser(db: PGlite, userId: string): Promise<void> {
  // Set the claim while still superuser, then drop to the non-privileged role so RLS engages.
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`)
}

// Run subsequent queries with RLS BYPASSED (superuser). Mirrors the service-role client used by
// sync / cron / admin code paths.
export async function actAsService(db: PGlite): Promise<void> {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`)
}

// ── seed helpers (run as the superuser/service role; RLS bypassed) ─────────────────────────────

let seq = 0
function uuid(): string {
  // Deterministic-enough unique v4-shaped id; avoids a crypto import and keeps share_code unique.
  const n = (++seq).toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${n}`
}

export async function seedUser(
  db: PGlite,
  opts: { id?: string; email?: string; role?: 'student' | 'admin'; year?: number | null; section?: string | null } = {}
): Promise<string> {
  const id = opts.id ?? uuid()
  await db.query(
    `INSERT INTO users (id, share_code, email, role, year, section) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, id.slice(-8).toUpperCase(), opts.email ?? null, opts.role ?? 'student', opts.year ?? null, opts.section ?? null]
  )
  return id
}

export async function seedCourse(
  db: PGlite,
  opts: {
    code: string; name?: string; tab: string; year?: number
    sessionDate?: string; start?: string; isCommon?: boolean; eventKind?: string
  }
): Promise<void> {
  await db.query(
    `INSERT INTO courses (course_code, course_name, sheet_tab, year, session_date, start_time, is_common, event_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      opts.code, opts.name ?? opts.code, opts.tab, opts.year ?? 2,
      opts.sessionDate ?? '2026-07-01', opts.start ?? '09:00',
      opts.isCommon ?? false, opts.eventKind ?? 'class',
    ]
  )
}

export async function seedRoster(
  db: PGlite,
  opts: { email: string; year: number; section?: string | null; codes?: string[] }
): Promise<void> {
  await db.query(
    `INSERT INTO roster (email, year, section, codes) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET year = EXCLUDED.year, section = EXCLUDED.section, codes = EXCLUDED.codes`,
    [opts.email.toLowerCase(), opts.year, opts.section ?? null, opts.codes ?? []]
  )
}

// The codes a `user_sessions(p_user)` call resolves to, sorted for stable assertions.
export async function sessionCodes(db: PGlite, userId: string): Promise<string[]> {
  const r = await db.query<{ course_code: string }>(`SELECT course_code FROM user_sessions($1)`, [userId])
  return r.rows.map((x) => x.course_code).sort()
}
