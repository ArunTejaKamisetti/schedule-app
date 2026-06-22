// Cache-Control presets for API route handlers.
//
// Vercel's CDN caches a function's GET response by full URL when the response carries an
// `s-maxage`. On a cache HIT the function never runs — so no Fluid Active CPU is billed. That is
// the whole point here: the shared, read-mostly course data (catalog / common events / section
// timetables / a week window) is identical for every user of a year and only changes when the
// sheet sync runs, so it should be served from the edge instead of recomputed per request.
//
// `s-maxage` targets the SHARED CDN cache only (not the browser), and `stale-while-revalidate`
// lets the edge serve a slightly stale copy instantly while it refreshes in the background — so a
// cache miss never makes a user wait. Per-USER mutable data (a user's picks, attendance, notes) is
// deliberately NOT given a public cache; it is deduped on the client by SWR instead, so a fresh
// pick/mark is never masked by a stale edge response.

// 5 min fresh on the edge, then serve stale for up to 30 min while revalidating in the background.
export const SHARED_CACHE = 'public, s-maxage=300, stale-while-revalidate=1800'

// Convenience for `NextResponse.json(data, { headers: cacheHeaders() })`.
export function cacheHeaders(value: string = SHARED_CACHE): Record<string, string> {
  return { 'Cache-Control': value }
}
