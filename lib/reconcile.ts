import type { createServiceClient } from './supabase/server'

// Roster-authoritative student cleanup (migration 018). "Departed" = a student (non-admin) whose
// email is in NO current roster row. The admin previews the impact, then confirms a hard delete;
// ON DELETE CASCADE clears that user's enrollments / friendships / notes / attendance / tokens.

type SB = ReturnType<typeof createServiceClient>

export interface DepartedPreview {
  count: number
  sample: { email: string | null; display_name: string | null }[]
  totalUsers: number
  rosterY1: number
  rosterY2: number
}

// Count + a small sample of departed students, plus the context the warning needs.
export async function previewDeparted(supabase: SB): Promise<DepartedPreview> {
  const head = { count: 'exact' as const, head: true }
  const [departed, sample, users, rY1, rY2] = await Promise.all([
    supabase.from('departed_students').select('*', head),
    supabase.from('departed_students').select('email, display_name').limit(10),
    supabase.from('users').select('*', head),
    supabase.from('roster').select('*', head).eq('year', 1),
    supabase.from('roster').select('*', head).eq('year', 2),
  ])
  return {
    count: departed.count ?? 0,
    sample: (sample.data ?? []) as { email: string | null; display_name: string | null }[],
    totalUsers: users.count ?? 0,
    rosterY1: rY1.count ?? 0,
    rosterY2: rY2.count ?? 0,
  }
}

// Run the prune (DB-side guarded against an empty roster). Returns the number removed.
export async function pruneDeparted(supabase: SB): Promise<number> {
  const { data, error } = await supabase.rpc('prune_departed_students')
  if (error) throw new Error(`Prune failed: ${error.message}`)
  return (data as number) ?? 0
}

// Pure: a human warning when a prune looks dangerous (no DB) — surfaced in the dashboard before the
// admin confirms. The most common mistake is reconciling after uploading only ONE of the two rosters.
export function reconcileWarning(input: {
  departed: number
  totalUsers: number
  rosterY1: number
  rosterY2: number
}): string | null {
  const { departed, totalUsers, rosterY1, rosterY2 } = input
  if (rosterY1 === 0 || rosterY2 === 0) {
    return 'A year’s roster is empty — upload BOTH the 1st-year and 2nd-year rosters before removing students.'
  }
  if (departed === 0) return null
  const pct = totalUsers > 0 ? departed / totalUsers : 0
  if (pct > 0.3) {
    return `This would remove ${departed} of ${totalUsers} students (${Math.round(pct * 100)}%) — double-check you uploaded the correct, complete rosters.`
  }
  return null
}
