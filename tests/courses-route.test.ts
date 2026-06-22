import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the Supabase service client so the route runs without a DB or env vars. The catalog and
// common branches are exercised to prove every shared variant returns the edge-cache header.
vi.mock('@/lib/supabase/server', () => {
  // A minimal thenable query builder: every chained method returns `this`, and awaiting it
  // resolves to a Supabase-shaped { data, error }.
  const builder: any = {
    select: () => builder, eq: () => builder, order: () => builder,
    gte: () => builder, lte: () => builder,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [{ course_code: 'ABC', sheet_tab: 'A' }], error: null }),
  }
  return {
    createServiceClient: () => ({
      rpc: async () => ({ data: [{ course_code: 'ABC' }], error: null }),
      from: () => builder,
    }),
  }
})

import { GET } from '@/app/api/courses/route'
import { SHARED_CACHE } from '@/lib/cache'

async function get(qs: string) {
  return GET(new NextRequest(`http://localhost/api/courses${qs}`))
}

describe('/api/courses caching', () => {
  it('catalog response is edge-cacheable', async () => {
    const res = await get('?catalog=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe(SHARED_CACHE)
  })

  it('common-events response is edge-cacheable', async () => {
    const res = await get('?common=1&year=2')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe(SHARED_CACHE)
  })

  it('date-window response is edge-cacheable', async () => {
    const res = await get('?from=2026-06-08&to=2026-06-14')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe(SHARED_CACHE)
  })
})
