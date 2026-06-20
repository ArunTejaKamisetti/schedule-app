import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { parseBusPayload, parseMessPayload } from '@/lib/bus-mess-validate'
import { saveContent } from '@/lib/site-content'

// POST /api/admin/bus-mess  { type: 'bus'|'mess', data: <pasted JSON or object> }
// Validates the pasted content against the app's shapes and saves it. Admin only.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const type = body?.type
  if (type !== 'bus' && type !== 'mess') {
    return NextResponse.json({ error: "type must be 'bus' or 'mess'" }, { status: 400 })
  }

  const parsed = type === 'bus' ? parseBusPayload(body.data) : parseMessPayload(body.data)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    await saveContent(type, parsed.value)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  const summary = type === 'bus'
    ? { trips: (parsed.value as { trips: unknown[] }).trips.length }
    : { days: Object.keys((parsed.value as { menu: object }).menu).length }
  return NextResponse.json({ ok: true, type, ...summary })
}
