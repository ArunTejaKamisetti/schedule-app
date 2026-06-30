// Mess-menu shapes. The actual menu is admin-uploaded (paste-import → `site_content`); there is no
// built-in default data (see lib/site-content.ts) so a fork doesn't ship IIM-K's menu — the Today
// tab shows an "ask your admin to upload" empty state until one is uploaded.
export interface Meal {
  veg: string[]
  special?: string[] // non-veg / egg / fish / chicken / paneer-special — highlighted
}
export interface DayMenu {
  breakfast: Meal
  lunch: Meal
  dinner: Meal
}
