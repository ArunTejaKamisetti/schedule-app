import { NextRequest, NextResponse } from 'next/server'
import { getUserByShareCode } from '@/lib/user'

// GET /api/user/resolve?code=XXXX — map a profile (share) code to its user id,
// so another device can import the whole profile.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const user = await getUserByShareCode(code)
  if (!user) return NextResponse.json({ error: 'No profile found for that code' }, { status: 404 })

  return NextResponse.json({ userId: user.id, shareCode: user.share_code })
}
