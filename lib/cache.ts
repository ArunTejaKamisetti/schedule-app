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

// 5 min fresh, then serve stale for up to 30 min while revalidating in the background.
// `max-age` (browser) is what cuts EDGE REQUESTS: with it a reload/reopen within 5 min is served
// from the browser's OWN cache and never reaches Vercel at all (an `s-maxage`-only response is a
// cheap CDN hit, but it's still an edge request every time). Safe because this shared schedule data
// only changes on a sync (~30 min) and we already accept 5 min of CDN staleness.
export const SHARED_CACHE = 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800'

// For per-USER read-mostly routes (a user's picks, their unread alerts, attendance summary). The
// URL carries the userId, so Vercel caches a separate edge entry per user — repeated opens of the
// PWA in a short window are served from the edge instead of re-invoking the function. The TTL is
// short and mutations update the client cache optimistically, so stale-on-hard-reload is bounded
// to a minute and never masks an action the user just took in the current session.
export const SHORT_CACHE = 'public, s-maxage=60, stale-while-revalidate=300'

// One year, immutable — for assets that never change (the generated PWA icons).
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

// Convenience for `NextResponse.json(data, { headers: cacheHeaders() })`.
export function cacheHeaders(value: string = SHARED_CACHE): Record<string, string> {
  return { 'Cache-Control': value }
}
