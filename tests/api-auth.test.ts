import { describe, it, expect } from 'vitest'
import { unauthorized } from '@/lib/api-auth'

describe('unauthorized()', () => {
  it('returns a 401 JSON response', async () => {
    const res = unauthorized()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Not authenticated' })
  })
})
