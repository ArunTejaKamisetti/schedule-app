import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser } from '@/lib/user'

export async function POST(req: NextRequest) {
  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  try {
    const user = await getOrCreateUser(userId)
    return NextResponse.json(user)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
