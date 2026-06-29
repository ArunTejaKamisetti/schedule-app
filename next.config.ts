import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'

// Supabase origin (https + realtime wss) so the browser auth/realtime client isn't blocked by CSP.
let supabaseConnect = ''
try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
    supabaseConnect = `${u.origin} wss://${u.host}`
  }
} catch {}

// Content-Security-Policy. Next injects inline bootstrap scripts and we use Tailwind inline styles,
// so script/style keep 'unsafe-inline' (a nonce pipeline would need per-request wiring through the
// proxy). Dev additionally needs 'unsafe-eval' + ws: for Turbopack HMR. connect-src is locked to
// self + this deployment's Supabase project.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseConnect}${isDev ? ' ws: http://localhost:*' : ''}`.trim(),
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  // Allow googleapis in server bundles
  serverExternalPackages: ['googleapis'],
  experimental: {
    // Reuse a visited route's RSC payload from the client Router Cache for longer, so tabbing
    // between pages doesn't re-fetch the segment from Vercel on every navigation (each refetch is an
    // edge request). Inner data still refreshes via SWR; only the shell is reused.
    staleTimes: { dynamic: 120, static: 600 },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
