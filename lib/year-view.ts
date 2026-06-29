// Year scoping for the schedule views. Students only ever see their own year; an admin (poweruser)
// can flip between 1st/2nd year via the header switch, so every year-aware page funnels through these
// two pure helpers (unit-tested) instead of re-deriving the rule per page.

// The year currently being viewed. Non-admins are always pinned to their own year (null ⇒ 2nd year);
// admins follow the header switch.
export function resolveViewYear(
  isAdmin: boolean,
  userYear: number | null | undefined,
  adminTab: 1 | 2,
): 1 | 2 {
  if (isAdmin) return adminTab
  return userYear === 1 ? 1 : 2
}

// Keep only the rows belonging to `year`, defaulting a missing year to 2 (the DB default). Used to
// scope the admin's all-years session/event feed down to the year they're browsing.
export function coursesForYear<T extends { year?: number | null }>(items: T[], year: 1 | 2): T[] {
  return items.filter((c) => (c.year ?? 2) === year)
}
