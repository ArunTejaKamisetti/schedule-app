import { describe, it, expect } from 'vitest'
import { SHARED_CACHE, SHORT_CACHE, IMMUTABLE_CACHE, cacheHeaders } from '@/lib/cache'

// The cache directives are what let Vercel's CDN serve routes/assets from the edge (so the
// function — and Fluid Active CPU — is skipped on a hit). Guard their shapes.
describe('cache headers', () => {
  it('SHARED_CACHE is a public, edge-cacheable directive with SWR', () => {
    expect(SHARED_CACHE).toContain('public')
    expect(SHARED_CACHE).toMatch(/s-maxage=\d+/)
    expect(SHARED_CACHE).toMatch(/stale-while-revalidate=\d+/)
  })

  it('SHORT_CACHE is public + edge-cacheable but shorter-lived than SHARED_CACHE', () => {
    expect(SHORT_CACHE).toContain('public')
    const short = Number(SHORT_CACHE.match(/s-maxage=(\d+)/)![1])
    const shared = Number(SHARED_CACHE.match(/s-maxage=(\d+)/)![1])
    expect(short).toBeGreaterThan(0)
    expect(short).toBeLessThan(shared)
  })

  it('IMMUTABLE_CACHE is a long-lived immutable browser cache (for static icons)', () => {
    expect(IMMUTABLE_CACHE).toContain('immutable')
    expect(IMMUTABLE_CACHE).toMatch(/max-age=\d{6,}/)
  })

  it('cacheHeaders() defaults to the shared directive', () => {
    expect(cacheHeaders()).toEqual({ 'Cache-Control': SHARED_CACHE })
  })

  it('cacheHeaders(value) passes a custom directive through', () => {
    expect(cacheHeaders('private, no-store')).toEqual({ 'Cache-Control': 'private, no-store' })
  })
})
