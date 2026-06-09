import { ImageResponse } from 'next/og'
import { IconArt } from '@/lib/icon-art'

export function GET() {
  return new ImageResponse(<IconArt size={192} />, { width: 192, height: 192 })
}
