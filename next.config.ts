import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow googleapis in server bundles
  serverExternalPackages: ['googleapis'],
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
