import { describe, it, expect } from 'vitest'
import { SHARED_CACHE, cacheHeaders } from '@/lib/cache'

// The shared cache directive is what lets Vercel's CDN serve the read-mostly course routes from
// the edge (so the function — and Fluid Active CPU — is skipped on a hit). Guard its shape.
describe('cache headers', () => {
  it('SHARED_CACHE is a public, edge-cacheable directive with SWR', () => {
    expect(SHARED_CACHE).toContain('public')
    expect(SHARED_CACHE).toMatch(/s-maxage=\d+/)
    expect(SHARED_CACHE).toMatch(/stale-while-revalidate=\d+/)
  })

  it('cacheHeaders() defaults to the shared directive', () => {
    expect(cacheHeaders()).toEqual({ 'Cache-Control': SHARED_CACHE })
  })

  it('cacheHeaders(value) passes a custom directive through', () => {
    expect(cacheHeaders('private, no-store')).toEqual({ 'Cache-Control': 'private, no-store' })
  })
})
