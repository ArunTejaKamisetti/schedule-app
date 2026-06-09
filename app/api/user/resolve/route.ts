import { NextRequest, NextResponse } from 'next/server'
import { getUserByImportCode } from '@/lib/user'

// GET /api/user/resolve?code=XXXX — map a PRIVATE import code to its user id,
// so another device can import the whole profile. (Friends use share_code, not this.)
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const user = await getUserByImportCode(code)
  if (!user) return NextResponse.json({ error: 'No profile found for that code' }, { status: 404 })

  return NextResponse.json({ userId: user.id, shareCode: user.share_code })
}
