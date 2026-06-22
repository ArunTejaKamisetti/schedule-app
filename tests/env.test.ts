import { describe, it, expect } from 'vitest'
import { REQUIRED_SERVER_ENV, validateEnv, assertServerEnv } from '@/lib/env'

// A fully-populated env source (every required var present and non-blank).
function fullEnv(): Record<string, string> {
  return Object.fromEntries(REQUIRED_SERVER_ENV.map((k) => [k, `value-${k}`]))
}

describe('validateEnv (missing-var detection)', () => {
  it('returns no missing vars when every required var is present', () => {
    expect(validateEnv(fullEnv())).toEqual([])
  })

  it('reports an absent var', () => {
    const env = fullEnv()
    delete env.SUPABASE_SERVICE_ROLE_KEY
    expect(validateEnv(env)).toEqual(['SUPABASE_SERVICE_ROLE_KEY'])
  })

  it('treats a blank / whitespace-only value as missing', () => {
    const env = fullEnv()
    env.CRON_SECRET = ''
    env.ADMIN_EMAILS = '   '
    expect(validateEnv(env).sort()).toEqual(['ADMIN_EMAILS', 'CRON_SECRET'])
  })

  it('does NOT require Google or VAPID vars (configured at runtime / optional)', () => {
    expect(REQUIRED_SERVER_ENV).not.toContain('GOOGLE_SHEET_ID')
    expect(REQUIRED_SERVER_ENV).not.toContain('GOOGLE_REFRESH_TOKEN')
    expect(REQUIRED_SERVER_ENV).not.toContain('GOOGLE_CLIENT_ID')
    expect(REQUIRED_SERVER_ENV).not.toContain('VAPID_PRIVATE_KEY')
    expect(REQUIRED_SERVER_ENV).not.toContain('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  })

  it('reports every missing var, not just the first', () => {
    expect(validateEnv({}).sort()).toEqual([...REQUIRED_SERVER_ENV].sort())
  })
})

describe('assertServerEnv (fail-fast)', () => {
  it('does not throw when the env is complete', () => {
    expect(() => assertServerEnv(fullEnv())).not.toThrow()
  })

  it('throws an aggregated message naming the missing vars', () => {
    const env = fullEnv()
    delete env.SUPABASE_SERVICE_ROLE_KEY
    delete env.CRON_SECRET
    expect(() => assertServerEnv(env)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
    expect(() => assertServerEnv(env)).toThrow(/CRON_SECRET/)
  })
})
