import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, seedUser, seedCourse, seedRoster, sessionCodes } from './db-harness'

// Integration tests for the timetable-resolution SQL that is the heart of the app — `user_sessions`
// (which sessions a given student sees, migration 017), `course_catalog`, and the roster RPCs —
// run against the REAL migrations in an ephemeral Postgres. This is the logic the unit suite cannot
// reach because it lives entirely in hand-pasted Postgres functions.

let db: PGlite

beforeAll(async () => {
  db = await freshDb()
}, 30_000)

afterAll(async () => {
  await db?.close()
})

describe('schema bootstrap', () => {
  it('applies all migrations and exposes the core objects', async () => {
    const tables = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`
    )
    const names = tables.rows.map((r) => r.tablename)
    expect(names).toEqual(expect.arrayContaining(['users', 'courses', 'enrollments', 'roster', 'friendships']))

    const fns = await db.query<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`
    )
    const fnNames = fns.rows.map((r) => r.proname)
    expect(fnNames).toEqual(expect.arrayContaining(['user_sessions', 'course_catalog', 'apply_roster_to_user']))
  })
})

describe('user_sessions — 1st-year section timetable', () => {
  it('returns the whole section timetable and nothing from other sections or year 2', async () => {
    await seedCourse(db, { code: 'Y1-ECO', tab: 'A', year: 1 })
    await seedCourse(db, { code: 'Y1-MKT', tab: 'A', year: 1, start: '11:00' })
    await seedCourse(db, { code: 'Y1-OTHER', tab: 'B', year: 1 }) // different section
    await seedCourse(db, { code: 'Y2-FIN', tab: 'D1', year: 2 }) // different year
    const student = await seedUser(db, { year: 1, section: 'A' })

    expect(await sessionCodes(db, student)).toEqual(['Y1-ECO', 'Y1-MKT'])
  })

  it('an enrollment row for a year-2 code does NOT leak into a year-1 student (branches mutually exclusive)', async () => {
    await seedCourse(db, { code: 'Y1-ONLY', tab: 'C', year: 1 })
    await seedCourse(db, { code: 'Y2-LEAK', tab: 'D2', year: 2 })
    const student = await seedUser(db, { year: 1, section: 'C' })
    await db.query(`INSERT INTO enrollments (user_id, course_code, year) VALUES ($1, 'Y2-LEAK', 2)`, [student])

    expect(await sessionCodes(db, student)).toEqual(['Y1-ONLY'])
  })
})

describe('user_sessions — 2nd-year electives by code', () => {
  it('returns only picked year-2 codes, resolving sessions added after the pick', async () => {
    await seedCourse(db, { code: 'GT', tab: 'D1', year: 2, sessionDate: '2026-07-01' })
    await seedCourse(db, { code: 'GT', tab: 'D1', year: 2, sessionDate: '2026-07-08' }) // later session, same code
    await seedCourse(db, { code: 'VCPE', tab: 'D1', year: 2 }) // not picked
    const student = await seedUser(db, { year: 2 })
    await db.query(`SELECT pick_course($1, 'GT')`, [student])

    const r = await db.query<{ course_code: string }>(`SELECT course_code FROM user_sessions($1)`, [student])
    expect(r.rows).toHaveLength(2) // both GT sessions resolved by code
    expect([...new Set(r.rows.map((x) => x.course_code))]).toEqual(['GT'])
  })

  it('a user with unset year is treated as year 2', async () => {
    await seedCourse(db, { code: 'STRAT', tab: 'E1', year: 2 })
    const student = await seedUser(db, { year: null })
    await db.query(`SELECT pick_course($1, 'STRAT')`, [student])

    expect(await sessionCodes(db, student)).toEqual(['STRAT'])
  })

  it('a year-1 course sharing a code is never returned to a year-2 picker (year-scoped)', async () => {
    await seedCourse(db, { code: 'SHARED', tab: 'D1', year: 2 })
    await seedCourse(db, { code: 'SHARED', tab: 'A', year: 1 }) // same code, year 1
    const student = await seedUser(db, { year: 2 })
    await db.query(`SELECT pick_course($1, 'SHARED')`, [student])

    const r = await db.query<{ year: number }>(`SELECT year FROM user_sessions($1)`, [student])
    expect(r.rows.every((x) => x.year === 2)).toBe(true)
    expect(r.rows).toHaveLength(1)
  })
})

describe('user_sessions — admin poweruser (migration 017)', () => {
  it('returns every non-common course across both years with no enrollment', async () => {
    await seedCourse(db, { code: 'ADM-Y1', tab: 'F', year: 1 })
    await seedCourse(db, { code: 'ADM-Y2', tab: 'D1', year: 2 })
    await seedCourse(db, { code: 'ADM-COMMON', tab: 'ALL', year: 2, isCommon: true })
    const admin = await seedUser(db, { role: 'admin', year: null })

    const codes = await sessionCodes(db, admin)
    expect(codes).toEqual(expect.arrayContaining(['ADM-Y1', 'ADM-Y2']))
    expect(codes).not.toContain('ADM-COMMON') // common events are excluded for the admin branch
  })

  it('admin is excluded from the student branches (no double-counting from a stray enrollment)', async () => {
    const admin = await seedUser(db, { role: 'admin', year: 1, section: 'A' })
    await db.query(`INSERT INTO enrollments (user_id, course_code, year) VALUES ($1, 'Y1-ECO', 2)`, [admin])
    // 'Y1-ECO' (year 1) was seeded earlier; admin should see it exactly once (via the admin branch),
    // not twice (admin + section). Count its occurrences.
    const r = await db.query<{ course_code: string }>(
      `SELECT course_code FROM user_sessions($1) WHERE course_code = 'Y1-ECO'`,
      [admin]
    )
    expect(r.rows).toHaveLength(1)
  })
})

describe('course_catalog', () => {
  it('year-parameterised overload returns one row per code for that year, excluding common events', async () => {
    await seedCourse(db, { code: 'CAT-Y1', tab: 'A', year: 1 })
    await seedCourse(db, { code: 'CAT-Y1', tab: 'A', year: 1, sessionDate: '2026-07-09' }) // 2nd session, same code
    await seedCourse(db, { code: 'CAT-Y2', tab: 'D1', year: 2 })
    await seedCourse(db, { code: 'CAT-COMMON', tab: 'ALL', year: 1, isCommon: true })

    const y1 = await db.query<{ course_code: string }>(`SELECT course_code FROM course_catalog($1::smallint)`, [1])
    const y1codes = y1.rows.map((r) => r.course_code)
    expect(y1codes.filter((c) => c === 'CAT-Y1')).toHaveLength(1) // DISTINCT ON (course_code)
    expect(y1codes).not.toContain('CAT-COMMON')
    expect(y1codes).not.toContain('CAT-Y2') // year-scoped

    const y2 = await db.query<{ course_code: string }>(`SELECT course_code FROM course_catalog($1::smallint)`, [2])
    expect(y2.rows.map((r) => r.course_code)).toContain('CAT-Y2')
  })

  it('no-arg overload stays year-2-only (back-compat for the elective picker)', async () => {
    const r = await db.query<{ year: number }>(`SELECT year FROM course_catalog()`)
    expect(r.rows.every((x) => x.year === 2)).toBe(true)
  })
})

describe('apply_roster_to_user (migration 015)', () => {
  it('year-1 roster sets year/section and clears any electives', async () => {
    const student = await seedUser(db, { email: 'r1@iimk.ac.in', year: 2 })
    await db.query(`SELECT pick_course($1, 'GT')`, [student]) // an existing elective to be cleared
    await seedRoster(db, { email: 'r1@iimk.ac.in', year: 1, section: 'G' })

    await db.query(`SELECT apply_roster_to_user($1, $2)`, [student, 'r1@iimk.ac.in'])

    const u = await db.query<{ year: number; section: string }>(`SELECT year, section FROM users WHERE id = $1`, [student])
    expect(u.rows[0]).toEqual({ year: 1, section: 'G' })
    const e = await db.query(`SELECT 1 FROM enrollments WHERE user_id = $1`, [student])
    expect(e.rows).toHaveLength(0)
  })

  it('year-2 roster replaces enrollments authoritatively on re-apply', async () => {
    const student = await seedUser(db, { email: 'r2@iimk.ac.in', year: 2 })
    await seedRoster(db, { email: 'r2@iimk.ac.in', year: 2, codes: ['AAA', 'BBB'] })
    await db.query(`SELECT apply_roster_to_user($1, $2)`, [student, 'r2@iimk.ac.in'])

    let codes = await db.query<{ course_code: string }>(`SELECT course_code FROM enrollments WHERE user_id = $1`, [student])
    expect(codes.rows.map((r) => r.course_code).sort()).toEqual(['AAA', 'BBB'])

    // Admin re-uploads with a different set — the new set is authoritative (old codes dropped).
    await seedRoster(db, { email: 'r2@iimk.ac.in', year: 2, codes: ['BBB', 'CCC'] })
    await db.query(`SELECT apply_roster_to_user($1, $2)`, [student, 'r2@iimk.ac.in'])
    codes = await db.query<{ course_code: string }>(`SELECT course_code FROM enrollments WHERE user_id = $1`, [student])
    expect(codes.rows.map((r) => r.course_code).sort()).toEqual(['BBB', 'CCC'])
  })

  it('matches the roster case-insensitively and is a no-op when no roster row exists', async () => {
    const student = await seedUser(db, { email: 'mixed@iimk.ac.in', year: 2 })
    await seedRoster(db, { email: 'mixed@iimk.ac.in', year: 1, section: 'H' })
    await db.query(`SELECT apply_roster_to_user($1, $2)`, [student, 'MiXeD@IIMK.ac.in']) // mixed-case input
    const u = await db.query<{ section: string }>(`SELECT section FROM users WHERE id = $1`, [student])
    expect(u.rows[0].section).toBe('H')

    const orphan = await seedUser(db, { email: 'noroster@iimk.ac.in', year: 2 })
    await db.query(`SELECT pick_course($1, 'KEEP')`, [orphan])
    await db.query(`SELECT apply_roster_to_user($1, $2)`, [orphan, 'noroster@iimk.ac.in']) // no roster row
    const keep = await db.query(`SELECT 1 FROM enrollments WHERE user_id = $1`, [orphan])
    expect(keep.rows).toHaveLength(1) // untouched
  })
})

describe('pick_course / unpick_course (migration 013)', () => {
  it('pick writes one enrollment row by code and is idempotent; unpick removes it', async () => {
    const student = await seedUser(db, { year: 2 })
    await db.query(`SELECT pick_course($1, 'IDEMP')`, [student])
    await db.query(`SELECT pick_course($1, 'IDEMP')`, [student]) // ON CONFLICT DO NOTHING
    let n = await db.query(`SELECT 1 FROM enrollments WHERE user_id = $1 AND course_code = 'IDEMP'`, [student])
    expect(n.rows).toHaveLength(1)

    await db.query(`SELECT unpick_course($1, 'IDEMP')`, [student])
    n = await db.query(`SELECT 1 FROM enrollments WHERE user_id = $1 AND course_code = 'IDEMP'`, [student])
    expect(n.rows).toHaveLength(0)
  })
})
