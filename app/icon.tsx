import { ImageResponse } from 'next/og'
import { IconArt } from '@/lib/icon-art'

export const size = { width: 256, height: 256 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(<IconArt size={256} />, { ...size })
}
