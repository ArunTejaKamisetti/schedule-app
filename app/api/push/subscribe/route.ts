import { NextRequest, NextResponse } from 'next/server'
import { updatePushSubscription } from '@/lib/user'

export async function POST(req: NextRequest) {
  const { userId, subscription } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  await updatePushSubscription(userId, subscription)
  return NextResponse.json({ ok: true })
}
