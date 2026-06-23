import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow googleapis in server bundles
  serverExternalPackages: ['googleapis'],
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Reuse a visited route's RSC payload from the client Router Cache for longer, so tabbing
    // between Today/Schedule/Courses/Friends doesn't re-fetch the page segment from Vercel on every
    // navigation (each refetch is an edge request). The inner data still refreshes via SWR, so only
    // the shell is reused; static pages keep their shell up to 10 min, dynamic up to 2.
    staleTimes: { dynamic: 120, static: 600 },
  },
}

export default nextConfig
