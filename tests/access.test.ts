import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { hasAppAccess, NotEnrolledError } from '@/lib/access'

// A fake supabase client whose rpc() returns a scripted result, so we can test hasAppAccess without
// a DB. (The DB predicate itself is covered by tests/db-access.test.ts.)
function client(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) }
}

describe('hasAppAccess', () => {
  const ORIG = process.env.ADMIN_EMAILS
  beforeEach(() => { process.env.ADMIN_EMAILS = 'admin@iimk.ac.in' })
  afterEach(() => { process.env.ADMIN_EMAILS = ORIG })

  it('always allows an admin WITHOUT hitting the DB', async () => {
    const sb = client({ data: false, error: null }) // would deny if consulted
    expect(await hasAppAccess(sb, 'Admin@iimk.ac.in')).toBe(true)
    expect(sb.rpc).not.toHaveBeenCalled()
  })

  it('denies an email-less account', async () => {
    const sb = client({ data: true, error: null })
    expect(await hasAppAccess(sb, null)).toBe(false)
    expect(await hasAppAccess(sb, '   ')).toBe(false)
    expect(sb.rpc).not.toHaveBeenCalled()
  })

  it('defers to has_roster_access for a normal student', async () => {
    expect(await hasAppAccess(client({ data: true, error: null }), 'stu@iimk.ac.in')).toBe(true)
    expect(await hasAppAccess(client({ data: false, error: null }), 'stu@iimk.ac.in')).toBe(false)
  })

  it('fails OPEN on an RPC error (never locks the institution out)', async () => {
    const sb = client({ data: null, error: { message: 'function missing' } })
    expect(await hasAppAccess(sb, 'stu@iimk.ac.in')).toBe(true)
  })
})

describe('NotEnrolledError', () => {
  it('is identifiable by instanceof for the 403/sign-out translation', () => {
    const e = new NotEnrolledError()
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(NotEnrolledError)
    expect(e.message).toBe('not_enrolled')
  })
})
