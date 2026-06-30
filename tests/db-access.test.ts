import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { freshDb, seedRoster } from './db-harness'

// has_roster_access (migration 023) is the single DB predicate behind the roster access gate
// (lib/access.ts). It decides whether a signed-in NON-admin may use the app; the admin allowance is
// applied in TS before this is ever called. It mirrors prune_departed_students' both-rosters guard.
async function access(db: PGlite, email: string | null): Promise<boolean> {
  const r = await db.query<{ has_roster_access: boolean }>(`SELECT has_roster_access($1)`, [email])
  return r.rows[0].has_roster_access
}

describe('has_roster_access', () => {
  let db: PGlite
  beforeEach(async () => { db = await freshDb() })

  it('allows a student listed in EITHER year’s roster', async () => {
    await seedRoster(db, { email: 'y1@iimk.ac.in', year: 1, section: 'A' })
    await seedRoster(db, { email: 'y2@iimk.ac.in', year: 2, codes: ['GT'] })
    expect(await access(db, 'y1@iimk.ac.in')).toBe(true)
    expect(await access(db, 'y2@iimk.ac.in')).toBe(true)
  })

  it('is case- and whitespace-insensitive on the email', async () => {
    await seedRoster(db, { email: 'mixed@iimk.ac.in', year: 2, codes: ['GT'] })
    expect(await access(db, '  MIXED@IIMK.AC.IN ')).toBe(true)
  })

  it('DENIES a student in NO roster once BOTH years are present', async () => {
    await seedRoster(db, { email: 'a@iimk.ac.in', year: 1, section: 'A' })
    await seedRoster(db, { email: 'b@iimk.ac.in', year: 2, codes: ['GT'] })
    expect(await access(db, 'departed@iimk.ac.in')).toBe(false)
  })

  it('does NOT deny when only one year is uploaded (can’t tell departed from not-yet-uploaded)', async () => {
    await seedRoster(db, { email: 'a@iimk.ac.in', year: 1, section: 'A' }) // year 2 not uploaded yet
    expect(await access(db, 'newcomer@iimk.ac.in')).toBe(true)
  })

  it('lets everyone in on a brand-new deployment with no roster at all', async () => {
    expect(await access(db, 'anyone@iimk.ac.in')).toBe(true)
  })

  it('rejects a null / blank email (invalid account)', async () => {
    await seedRoster(db, { email: 'a@iimk.ac.in', year: 1, section: 'A' })
    await seedRoster(db, { email: 'b@iimk.ac.in', year: 2, codes: ['GT'] })
    expect(await access(db, null)).toBe(false)
    expect(await access(db, '   ')).toBe(false)
  })
})
