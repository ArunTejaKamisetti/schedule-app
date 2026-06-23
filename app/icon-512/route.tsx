import { ImageResponse } from 'next/og'
import { IconArt } from '@/lib/icon-art'
import { IMMUTABLE_CACHE } from '@/lib/cache'

// See icon-192: rendered once at build, served statically from the CDN, never re-invoked.
export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(<IconArt size={512} />, {
    width: 512,
    height: 512,
    headers: { 'Cache-Control': IMMUTABLE_CACHE },
  })
}
