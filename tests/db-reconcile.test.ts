import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, seedUser, seedRoster, seedCourse, actAsService } from './db-harness'

// Integration tests for migration 018 — the roster-authoritative student prune — against the real
// migrations in an ephemeral Postgres. These cover a DESTRUCTIVE path, so each test gets a fresh DB.

let db: PGlite

beforeEach(async () => {
  db = await freshDb()
  await actAsService(db) // prune/preview run via the service client (RLS bypassed)
}, 30_000)

afterEach(async () => {
  await db?.close()
})

describe('replace_roster_year (authoritative per-year)', () => {
  it('replaces only its own year and leaves the other year intact', async () => {
    await seedRoster(db, { email: 'old-y1@iimk.ac.in', year: 1, section: 'A' })
    await seedRoster(db, { email: 'y2@iimk.ac.in', year: 2, codes: ['GT'] })

    await db.query(`SELECT replace_roster_year(1::smallint, $1::jsonb)`, [
      JSON.stringify([{ email: 'new-y1@iimk.ac.in', section: 'B' }]),
    ])

    const y1 = await db.query<{ email: string; section: string }>(`SELECT email, section FROM roster WHERE year = 1`)
    expect(y1.rows).toEqual([{ email: 'new-y1@iimk.ac.in', section: 'B' }]) // old Y1 row dropped
    const y2 = await db.query<{ email: string }>(`SELECT email FROM roster WHERE year = 2`)
    expect(y2.rows.map((r) => r.email)).toEqual(['y2@iimk.ac.in']) // Y2 untouched
  })

  it('lowercases emails and skips blank rows', async () => {
    await db.query(`SELECT replace_roster_year(2::smallint, $1::jsonb)`, [
      JSON.stringify([{ email: 'MixedCase@IIMK.ac.in', codes: ['X'] }, { email: '   ', codes: [] }]),
    ])
    const r = await db.query<{ email: string }>(`SELECT email FROM roster WHERE year = 2`)
    expect(r.rows.map((x) => x.email)).toEqual(['mixedcase@iimk.ac.in'])
  })

  it('moves a promoted student from Y1 to Y2 by email instead of colliding on the PK (migration 022)', async () => {
    await seedRoster(db, { email: 'promo@iimk.ac.in', year: 1, section: 'A' })
    // The new Y2 roster re-lists the same email; the old Y1 row still exists. Must upsert, not throw.
    await db.query(`SELECT replace_roster_year(2::smallint, $1::jsonb)`, [
      JSON.stringify([{ email: 'promo@iimk.ac.in', codes: ['GT'] }]),
    ])
    const r = await db.query<{ year: number; codes: string[] }>(
      `SELECT year, codes FROM roster WHERE email = 'promo@iimk.ac.in'`
    )
    expect(r.rows).toHaveLength(1) // one row, moved — not a duplicate
    expect(r.rows[0].year).toBe(2)
    expect(r.rows[0].codes).toEqual(['GT'])
    expect((await db.query(`SELECT 1 FROM roster WHERE year = 1`)).rows).toHaveLength(0) // stale Y1 gone
  })
})

describe('departed_students', () => {
  it('is a SECURITY INVOKER view (migration 020 — honours the caller’s RLS, not the owner’s)', async () => {
    // reloptions carries the view's security_invoker flag; Supabase's linter errors if it's a
    // SECURITY DEFINER view, so this guards against a regression in how the view is (re)defined.
    const r = await db.query<{ reloptions: string[] | null }>(
      `SELECT reloptions FROM pg_class WHERE relname = 'departed_students' AND relkind = 'v'`
    )
    // Postgres normalises the flag to `security_invoker=true`; pglite keeps the literal `on` — accept both.
    const opts = r.rows[0]?.reloptions ?? []
    expect(opts.some((o) => /^security_invoker=(on|true)$/i.test(o))).toBe(true)
  })

  it('lists only students in NO roster — never admins, never in-roster students', async () => {
    await seedUser(db, { email: 'k1@iimk.ac.in', year: 1, section: 'A' })
    await seedUser(db, { email: 'k2@iimk.ac.in', year: 2 })
    await seedUser(db, { email: 'gone@iimk.ac.in', year: 2 })
    await seedUser(db, { email: 'admin@iimk.ac.in', role: 'admin' }) // not on any roster, but exempt
    await seedRoster(db, { email: 'k1@iimk.ac.in', year: 1, section: 'A' })
    await seedRoster(db, { email: 'k2@iimk.ac.in', year: 2, codes: ['GT'] })

    const r = await db.query<{ email: string }>(`SELECT email FROM departed_students ORDER BY email`)
    expect(r.rows.map((x) => x.email)).toEqual(['gone@iimk.ac.in'])
  })
})

describe('prune_departed_students', () => {
  it('hard-deletes departed students and cascades their data; keeps in-roster students', async () => {
    const keep = await seedUser(db, { email: 'keep@iimk.ac.in', year: 2 })
    const gone = await seedUser(db, { email: 'gone@iimk.ac.in', year: 2 })
    await seedRoster(db, { email: 'keep@iimk.ac.in', year: 2, codes: ['GT'] })
    await seedRoster(db, { email: 'y1@iimk.ac.in', year: 1, section: 'A' }) // both-years guard (migration 022)

    await seedCourse(db, { code: 'GT', tab: 'D1', year: 2 })
    const c = await db.query<{ id: string }>(`SELECT id FROM courses WHERE course_code = 'GT' LIMIT 1`)
    const courseId = c.rows[0].id
    await db.query(`INSERT INTO enrollments (user_id, course_code, year) VALUES ($1,'GT',2)`, [gone])
    await db.query(`INSERT INTO notes (user_id, course_id, body) VALUES ($1,$2,'note')`, [gone, courseId])
    await db.query(`INSERT INTO attendance (user_id, course_id, status) VALUES ($1,$2,'present')`, [gone, courseId])
    await db.query(
      `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1,$2,'accepted'),($2,$1,'accepted')`,
      [gone, keep]
    )

    const n = await db.query<{ n: number }>(`SELECT prune_departed_students() AS n`)
    expect(n.rows[0].n).toBe(1)

    const users = await db.query<{ email: string }>(`SELECT email FROM users ORDER BY email`)
    expect(users.rows.map((x) => x.email)).toEqual(['keep@iimk.ac.in'])
    expect((await db.query(`SELECT 1 FROM enrollments WHERE user_id = $1`, [gone])).rows).toHaveLength(0)
    expect((await db.query(`SELECT 1 FROM notes WHERE user_id = $1`, [gone])).rows).toHaveLength(0)
    expect((await db.query(`SELECT 1 FROM attendance WHERE user_id = $1`, [gone])).rows).toHaveLength(0)
    // both directions of the friendship cascade away when `gone` is deleted
    expect((await db.query(`SELECT 1 FROM friendships`)).rows).toHaveLength(0)
  })

  it('refuses to delete anyone when the roster is empty (guard against a total wipe)', async () => {
    await seedUser(db, { email: 'a@iimk.ac.in', year: 2 })
    await seedUser(db, { email: 'b@iimk.ac.in', year: 2 })

    const n = await db.query<{ n: number }>(`SELECT prune_departed_students() AS n`)
    expect(n.rows[0].n).toBe(0)
    expect((await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM users`)).rows[0].c).toBe(2)
  })

  it('refuses when only ONE year’s roster is present — a partial upload (migration 022)', async () => {
    await seedUser(db, { email: 'a@iimk.ac.in', year: 2 })
    await seedUser(db, { email: 'b@iimk.ac.in', year: 2 }) // not in roster — would look "departed"
    await seedRoster(db, { email: 'a@iimk.ac.in', year: 2, codes: ['GT'] }) // only Y2 uploaded; Y1 empty

    const n = await db.query<{ n: number }>(`SELECT prune_departed_students() AS n`)
    expect(n.rows[0].n).toBe(0) // blocked — without the guard, b@ would be wrongly pruned
    expect((await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM users`)).rows[0].c).toBe(2)
  })

  it('keeps a promoted student who reappears in the new Y2 roster', async () => {
    const promoted = await seedUser(db, { email: 'promo@iimk.ac.in', year: 1, section: 'A' })
    await seedRoster(db, { email: 'promo@iimk.ac.in', year: 2, codes: ['GT'] }) // now a 2nd-year
    await seedRoster(db, { email: 'freshman@iimk.ac.in', year: 1, section: 'B' }) // both-years guard

    const n = await db.query<{ n: number }>(`SELECT prune_departed_students() AS n`)
    expect(n.rows[0].n).toBe(0)
    expect((await db.query(`SELECT 1 FROM users WHERE id = $1`, [promoted])).rows).toHaveLength(1)
  })
})

describe('invalid_users (email-less accounts — migration 022)', () => {
  it('lists only non-admin rows with a NULL or blank email', async () => {
    await seedUser(db, { email: 'real@iimk.ac.in', year: 2 }) // valid — excluded
    const nullEmail = await seedUser(db, {})                    // NULL email — invalid
    const blankEmail = await seedUser(db, { email: '   ', year: 1 }) // blank email — invalid
    await seedUser(db, { role: 'admin' })                       // NULL-email admin — exempt

    const r = await db.query<{ id: string }>(`SELECT id FROM invalid_users ORDER BY id`)
    expect(r.rows.map((x) => x.id).sort()).toEqual([nullEmail, blankEmail].sort())
  })

  it('prune_invalid_users hard-deletes them and cascades; keeps valid students and admins', async () => {
    await seedUser(db, { email: 'real@iimk.ac.in', year: 2 })
    await seedUser(db, { role: 'admin' }) // NULL-email admin must survive
    const junk = await seedUser(db, {})
    await seedCourse(db, { code: 'GT', tab: 'D1', year: 2 })
    await db.query(`INSERT INTO enrollments (user_id, course_code, year) VALUES ($1,'GT',2)`, [junk])

    const n = await db.query<{ n: number }>(`SELECT prune_invalid_users() AS n`)
    expect(n.rows[0].n).toBe(1)
    expect((await db.query(`SELECT 1 FROM users WHERE id = $1`, [junk])).rows).toHaveLength(0)
    expect((await db.query(`SELECT 1 FROM enrollments WHERE user_id = $1`, [junk])).rows).toHaveLength(0)
    expect((await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM users`)).rows[0].c).toBe(2)
  })
})
