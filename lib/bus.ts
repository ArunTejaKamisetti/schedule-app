// Bus-timing shape. The actual timings are admin-uploaded (paste-import → `site_content`); there is
// no built-in default data (see lib/site-content.ts) so a fork doesn't ship IIM-K's schedule — the
// Today tab shows an "ask your admin to upload" empty state until one is uploaded.
export interface BusTrip {
  time: string   // display time of departure
  min: number    // minutes since midnight (for "next bus")
  from: string
  to: string[]   // ordered stops after `from`
  maingate: boolean
}
