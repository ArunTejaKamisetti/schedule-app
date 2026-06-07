import { NextRequest, NextResponse } from 'next/server'
import { updateDisplayName } from '@/lib/user'

export async function PATCH(req: NextRequest) {
  const { userId, name } = await req.json()
  if (!userId || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  await updateDisplayName(userId, name)
  return NextResponse.json({ ok: true })
}
