import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  emailDomainAllowed,
  parseAdminEmails,
  isAdminEmail,
  isPublicPath,
  authRouteAction,
} from '@/lib/auth'

describe('emailDomainAllowed (college sign-in gate)', () => {
  it('accepts a college-domain email', () => {
    expect(emailDomainAllowed('student@iimk.ac.in', 'iimk.ac.in')).toBe(true)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(emailDomainAllowed('  Student@IIMK.AC.IN ', 'iimk.ac.in')).toBe(true)
  })

  it('rejects other domains', () => {
    expect(emailDomainAllowed('me@gmail.com', 'iimk.ac.in')).toBe(false)
  })

  it('rejects a look-alike domain (no partial suffix match)', () => {
    expect(emailDomainAllowed('me@notiimk.ac.in', 'iimk.ac.in')).toBe(false)
    expect(emailDomainAllowed('me@evil-iimk.ac.in.attacker.com', 'iimk.ac.in')).toBe(false)
  })

  it('rejects empty, null, or malformed emails', () => {
    expect(emailDomainAllowed('', 'iimk.ac.in')).toBe(false)
    expect(emailDomainAllowed(null, 'iimk.ac.in')).toBe(false)
    expect(emailDomainAllowed(undefined, 'iimk.ac.in')).toBe(false)
    expect(emailDomainAllowed('noatsign', 'iimk.ac.in')).toBe(false)
  })

  it('tolerates a leading @ in the configured domain', () => {
    expect(emailDomainAllowed('a@iimk.ac.in', '@iimk.ac.in')).toBe(true)
  })
})

describe('admin role assignment', () => {
  it('parses a CSV with spaces, casing, and trailing commas', () => {
    expect(parseAdminEmails('A@iimk.ac.in, b@iimk.ac.in ,')).toEqual([
      'a@iimk.ac.in',
      'b@iimk.ac.in',
    ])
  })

  it('returns [] for empty / undefined', () => {
    expect(parseAdminEmails('')).toEqual([])
    expect(parseAdminEmails(undefined)).toEqual([])
    expect(parseAdminEmails(null)).toEqual([])
  })

  it('matches an admin email case-insensitively', () => {
    const admins = parseAdminEmails('admin@iimk.ac.in')
    expect(isAdminEmail('Admin@IIMK.ac.in', admins)).toBe(true)
    expect(isAdminEmail('other@iimk.ac.in', admins)).toBe(false)
    expect(isAdminEmail(null, admins)).toBe(false)
  })

  it('nobody is admin when the list is empty', () => {
    expect(isAdminEmail('admin@iimk.ac.in', [])).toBe(false)
  })
})

describe('route protection (proxy decision)', () => {
  it('identifies public paths', () => {
    expect(isPublicPath('/sign-in')).toBe(true)
    expect(isPublicPath('/auth/callback')).toBe(true)
    expect(isPublicPath('/today')).toBe(false)
  })

  it('redirects unauthenticated users to sign-in (except public + api)', () => {
    expect(authRouteAction('/today', false)).toBe('to-sign-in')
    expect(authRouteAction('/schedule', false)).toBe('to-sign-in')
    expect(authRouteAction('/', false)).toBe('to-sign-in')
    expect(authRouteAction('/sign-in', false)).toBe('allow')
    expect(authRouteAction('/auth/callback', false)).toBe('allow')
    // API routes do their own auth and must not be redirected.
    expect(authRouteAction('/api/courses', false)).toBe('allow')
  })

  it('keeps authenticated users out of sign-in and lets them through elsewhere', () => {
    expect(authRouteAction('/sign-in', true)).toBe('to-home')
    expect(authRouteAction('/today', true)).toBe('allow')
    expect(authRouteAction('/api/courses', true)).toBe('allow')
  })
})

describe('normalizeEmail', () => {
  it('trims and lowercases; treats nullish as empty', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
  })
})
