import type { Course } from './types'

// How long a sheet-change highlight ("New" / "Moved" / "Cancelled" …) stays visible after the edit.
// Centralised so the UI badge window and the sync's stale-highlight cleanup agree on ONE number —
// the source of the old "tags never go away" bug was these drifting / never being cleared.
export const CHANGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

export const CHANGE_LABEL: Record<string, string> = {
  added: 'New', moved: 'Moved', updated: 'Updated',
  rescheduled: 'Rescheduled', room_change: 'Class changed', cancelled: 'Cancelled',
}

// A course is "recently changed" while its highlight is still inside the window. `now` is injectable
// so the rule is unit-testable without faking the clock.
export function recentlyChanged(
  c: Pick<Course, 'last_changed_at' | 'change_kind'>,
  now: number = Date.now(),
): boolean {
  if (!c.last_changed_at || !c.change_kind) return false
  return now - new Date(c.last_changed_at).getTime() < CHANGE_WINDOW_MS
}
