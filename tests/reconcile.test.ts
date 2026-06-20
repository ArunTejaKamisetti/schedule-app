import { describe, it, expect } from 'vitest'
import { reconcileWarning } from '@/lib/reconcile'

// Pure guard logic shown to the admin before a destructive prune (no DB).
describe('reconcileWarning', () => {
  it('warns (over everything else) when either year’s roster is empty', () => {
    expect(reconcileWarning({ departed: 5, totalUsers: 100, rosterY1: 0, rosterY2: 50 })).toMatch(/both/i)
    expect(reconcileWarning({ departed: 5, totalUsers: 100, rosterY1: 50, rosterY2: 0 })).toMatch(/both/i)
    // empty-year warning fires even when nothing looks departed yet
    expect(reconcileWarning({ departed: 0, totalUsers: 100, rosterY1: 0, rosterY2: 0 })).toMatch(/both/i)
  })

  it('returns null when both rosters are present and nothing has departed', () => {
    expect(reconcileWarning({ departed: 0, totalUsers: 100, rosterY1: 50, rosterY2: 50 })).toBeNull()
  })

  it('warns when the removal would exceed 30% of students', () => {
    expect(reconcileWarning({ departed: 40, totalUsers: 100, rosterY1: 50, rosterY2: 50 })).toMatch(/double-check/i)
  })

  it('does not warn for a modest removal', () => {
    expect(reconcileWarning({ departed: 10, totalUsers: 100, rosterY1: 50, rosterY2: 50 })).toBeNull()
  })
})
