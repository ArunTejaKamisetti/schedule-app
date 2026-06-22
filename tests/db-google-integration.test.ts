import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, seedUser, actAsUser, actAsService } from './db-harness'

// RLS for the Google integration tables (migration 019).
//   • google_integration holds the client SECRET + the admin's sheet refresh token. RLS is on with
//     NO policy, so only the service role (RLS-bypass) reaches it — anon/authenticated are denied
//     even though they hold table grants. This keeps secrets off every browser-reachable path.
//   • schedule_sources holds admin-pasted (non-secret) sheet ids: any authenticated user may READ,
//     only an admin may WRITE.

let db: PGlite
let student: string
let admin: string

beforeAll(async () => {
  db = await freshDb()
  await actAsService(db)
  student = await seedUser(db, { email: 'stu@iimk.ac.in', year: 2 })
  admin = await seedUser(db, { email: 'admin@iimk.ac.in', role: 'admin' })

  // Service-role seeds (RLS bypassed), as the real sync/admin code does.
  await db.query(`INSERT INTO google_integration (id, client_id, sheet_refresh_token) VALUES (true, 'cid', 'rtok')`)
  await db.query(`INSERT INTO schedule_sources (source_key, sheet_id) VALUES ('y2', 'SHEET_Y2')`)
}, 30_000)

afterAll(async () => {
  await db?.close()
})

describe('google_integration (service-only)', () => {
  it('the service role can read the secret row', async () => {
    await actAsService(db)
    const r = await db.query<{ sheet_refresh_token: string }>(`SELECT sheet_refresh_token FROM google_integration`)
    expect(r.rows[0]?.sheet_refresh_token).toBe('rtok')
  })

  it('a signed-in student cannot read the secret row', async () => {
    await actAsUser(db, student)
    const r = await db.query(`SELECT * FROM google_integration`)
    expect(r.rows).toHaveLength(0)
  })

  it('an admin still cannot read the secret row (no policy grants it)', async () => {
    await actAsUser(db, admin)
    const r = await db.query(`SELECT * FROM google_integration`)
    expect(r.rows).toHaveLength(0)
  })

  it('a signed-in user cannot write the secret row', async () => {
    await actAsUser(db, student)
    await expect(
      db.query(`INSERT INTO google_integration (id, client_id) VALUES (true, 'forged')`)
    ).rejects.toThrow(/row-level security/i)
  })
})

describe('schedule_sources (admin-write, authenticated-read)', () => {
  it('any authenticated user can read the pasted sheet ids', async () => {
    await actAsUser(db, student)
    const r = await db.query<{ sheet_id: string }>(`SELECT sheet_id FROM schedule_sources WHERE source_key = 'y2'`)
    expect(r.rows[0]?.sheet_id).toBe('SHEET_Y2')
  })

  it('a non-admin cannot write a sheet id', async () => {
    await actAsUser(db, student)
    await expect(
      db.query(`INSERT INTO schedule_sources (source_key, sheet_id) VALUES ('y1-AH', 'HACK')`)
    ).rejects.toThrow(/row-level security/i)
  })

  it('an admin can upsert a sheet id', async () => {
    await actAsUser(db, admin)
    await db.query(`INSERT INTO schedule_sources (source_key, sheet_id) VALUES ('y1-AH', 'SHEET_Y1')`)
    const r = await db.query<{ sheet_id: string }>(`SELECT sheet_id FROM schedule_sources WHERE source_key = 'y1-AH'`)
    expect(r.rows[0]?.sheet_id).toBe('SHEET_Y1')
  })
})
