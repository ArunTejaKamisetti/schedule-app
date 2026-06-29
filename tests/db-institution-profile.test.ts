import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, seedUser, actAsUser, actAsService } from './db-harness'

// Integration test for migration 021 (`institution_profile`) run against the REAL migrations: it is
// authenticated-readable (the profile drives parsing/display — not a secret) but admin-write only.
// This pins the RLS so a student can never tamper with how everyone's schedule changes are detected.

let db: PGlite
let adminId: string
let studentId: string

beforeAll(async () => {
  db = await freshDb()
  adminId = await seedUser(db, { role: 'admin', email: 'admin@iimk.ac.in' })
  studentId = await seedUser(db, { role: 'student', email: 'student@iimk.ac.in' })
}, 30_000)

afterAll(async () => {
  await db?.close()
})

describe('institution_profile — schema + RLS', () => {
  it('the table exists with the key→data shape', async () => {
    await actAsService(db)
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'institution_profile'`
    )
    expect(cols.rows.map((c) => c.column_name)).toEqual(expect.arrayContaining(['key', 'data', 'updated_at']))
  })

  it('the service role can upsert and read a concern row', async () => {
    await actAsService(db)
    await db.query(
      `INSERT INTO institution_profile (key, data) VALUES ('colors', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify({ mode: 'custom', cancelled: ['#ffff00'] })]
    )
    const r = await db.query<{ data: { mode: string } }>(`SELECT data FROM institution_profile WHERE key = 'colors'`)
    expect(r.rows[0]?.data.mode).toBe('custom')
  })

  it('an authenticated student CAN read the profile', async () => {
    await actAsUser(db, studentId)
    const r = await db.query(`SELECT key FROM institution_profile`)
    expect(r.rows.length).toBeGreaterThanOrEqual(1)
  })

  it('a student CANNOT write the profile (RLS denies)', async () => {
    await actAsUser(db, studentId)
    await expect(
      db.query(`INSERT INTO institution_profile (key, data) VALUES ('catalog', '{}'::jsonb)`)
    ).rejects.toThrow()
  })

  it('an admin CAN write the profile', async () => {
    await actAsUser(db, adminId)
    await db.query(
      `INSERT INTO institution_profile (key, data) VALUES ('sections', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify({ sectionLabels: ['A', 'B'] })]
    )
    await actAsService(db)
    const r = await db.query<{ data: { sectionLabels: string[] } }>(`SELECT data FROM institution_profile WHERE key = 'sections'`)
    expect(r.rows[0]?.data.sectionLabels).toEqual(['A', 'B'])
  })
})
