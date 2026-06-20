import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, seedUser, seedCourse, actAsUser, actAsService } from './db-harness'

// RLS enforcement tests (migration 014) — the database-level guarantee that a signed-in student
// can only ever read/write their OWN rows, even with a crafted query. We seed as the service role
// (RLS bypassed), then run AS each user (`SET ROLE authenticated` + jwt sub) so the policies apply,
// exactly as the cookie-aware client does in production.

let db: PGlite
let A: string
let B: string
let admin: string
let courseId: string

beforeAll(async () => {
  db = await freshDb()
  await actAsService(db)

  A = await seedUser(db, { email: 'a@iimk.ac.in', year: 2 })
  B = await seedUser(db, { email: 'b@iimk.ac.in', year: 2 })
  admin = await seedUser(db, { email: 'admin@iimk.ac.in', role: 'admin' })

  await seedCourse(db, { code: 'RLS-C', tab: 'D1', year: 2 })
  const c = await db.query<{ id: string }>(`SELECT id FROM courses WHERE course_code = 'RLS-C' LIMIT 1`)
  courseId = c.rows[0].id

  // Owner-scoped rows for both A and B.
  await db.query(`INSERT INTO enrollments (user_id, course_code, year) VALUES ($1,'EA',2), ($2,'EB',2)`, [A, B])
  await db.query(`INSERT INTO notes (user_id, course_id, body) VALUES ($1,$2,'a-note'), ($3,$2,'b-note')`, [A, courseId, B])
  await db.query(`INSERT INTO user_calendar_tokens (user_id, refresh_token) VALUES ($1,'a-tok'), ($2,'b-tok')`, [A, B])
  // Mutual friendship (both directions, as the app writes it).
  await db.query(
    `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1,$2,'accepted'), ($2,$1,'accepted')`,
    [A, B]
  )
}, 30_000)

afterAll(async () => {
  await db?.close()
})

describe('owner-scoped reads', () => {
  it('a student sees only their own enrollments', async () => {
    await actAsUser(db, A)
    const r = await db.query<{ course_code: string }>(`SELECT course_code FROM enrollments`)
    expect(r.rows.map((x) => x.course_code)).toEqual(['EA'])

    await actAsUser(db, B)
    const r2 = await db.query<{ course_code: string }>(`SELECT course_code FROM enrollments`)
    expect(r2.rows.map((x) => x.course_code)).toEqual(['EB'])
  })

  it('a student sees only their own notes', async () => {
    await actAsUser(db, A)
    const r = await db.query<{ body: string }>(`SELECT body FROM notes`)
    expect(r.rows.map((x) => x.body)).toEqual(['a-note'])
  })

  it("a student cannot read another student's calendar tokens", async () => {
    await actAsUser(db, A)
    const all = await db.query(`SELECT user_id FROM user_calendar_tokens`)
    expect(all.rows).toHaveLength(1) // only A's own row, never B's

    const probeB = await db.query(`SELECT refresh_token FROM user_calendar_tokens WHERE user_id = $1`, [B])
    expect(probeB.rows).toHaveLength(0) // explicit cross-user probe returns nothing
  })

  it('a student sees only their own users row; an admin sees everyone', async () => {
    await actAsUser(db, A)
    const selfOnly = await db.query<{ id: string }>(`SELECT id FROM users`)
    expect(selfOnly.rows.map((x) => x.id)).toEqual([A])

    await actAsUser(db, admin)
    const allUsers = await db.query<{ id: string }>(`SELECT id FROM users`)
    expect(allUsers.rows.map((x) => x.id).sort()).toEqual([A, B, admin].sort())
  })

  it('both endpoints of a friendship can read the edge', async () => {
    await actAsUser(db, A)
    const r = await db.query(`SELECT user_id, friend_id FROM friendships`)
    expect(r.rows).toHaveLength(2) // the A→B and B→A rows both involve A
  })
})

describe('reference data is readable by any authenticated user', () => {
  it('courses are visible regardless of ownership', async () => {
    await actAsUser(db, A)
    const r = await db.query(`SELECT count(*)::int AS n FROM courses`)
    expect((r.rows[0] as { n: number }).n).toBeGreaterThan(0)
  })
})

describe('owner-scoped writes', () => {
  it('a student can insert their own enrollment but not one for another user', async () => {
    await actAsUser(db, A)
    await db.query(`INSERT INTO enrollments (user_id, course_code, year) VALUES ($1,'OWN',2)`, [A]) // allowed

    await expect(
      db.query(`INSERT INTO enrollments (user_id, course_code, year) VALUES ($1,'FORGED',2)`, [B])
    ).rejects.toThrow(/row-level security/i)
  })

  it("an update targeting another student's user row affects nothing", async () => {
    await actAsUser(db, A)
    const res = await db.query(`UPDATE users SET display_name = 'hacked' WHERE id = $1`, [B])
    expect(res.affectedRows ?? 0).toBe(0)

    await actAsService(db)
    const check = await db.query<{ display_name: string | null }>(`SELECT display_name FROM users WHERE id = $1`, [B])
    expect(check.rows[0].display_name).not.toBe('hacked')
  })
})
