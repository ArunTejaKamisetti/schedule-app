import { ImageResponse } from 'next/og'
import { IconArt } from '@/lib/icon-art'

// Rendered once at build (force-static) and served as an immutable static file from the CDN — no
// per-request Satori/resvg rasterization, which was a major Active-CPU sink.
export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(<IconArt size={192} />, {
    width: 192,
    height: 192,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
