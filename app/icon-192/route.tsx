import { ImageResponse } from 'next/og'
import { IconArt } from '@/lib/icon-art'
import { IMMUTABLE_CACHE } from '@/lib/cache'

// The PWA icon never changes, so it must NOT be rendered per request. `force-static` makes Next
// render this ONCE at build time and serve it as a static file from the CDN — no function
// invocation, no per-request Satori/resvg rasterization (the biggest Active-CPU sink we had). The
// immutable Cache-Control also stops browsers from ever re-requesting it.
export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(<IconArt size={192} />, {
    width: 192,
    height: 192,
    headers: { 'Cache-Control': IMMUTABLE_CACHE },
  })
}
