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
})

describe('departed_students', () => {
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

  it('keeps a promoted student who reappears in the new Y2 roster', async () => {
    const promoted = await seedUser(db, { email: 'promo@iimk.ac.in', year: 1, section: 'A' })
    await seedRoster(db, { email: 'promo@iimk.ac.in', year: 2, codes: ['GT'] }) // now a 2nd-year

    const n = await db.query<{ n: number }>(`SELECT prune_departed_students() AS n`)
    expect(n.rows[0].n).toBe(0)
    expect((await db.query(`SELECT 1 FROM users WHERE id = $1`, [promoted])).rows).toHaveLength(1)
  })
})
