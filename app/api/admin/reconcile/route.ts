import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { previewDeparted, pruneDeparted, reconcileWarning } from '@/lib/reconcile'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/admin/reconcile — preview students no longer in any roster (admin only). The dashboard
// renders count + sample + a warning before the admin confirms.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const preview = await previewDeparted(supabase)
  const warning = reconcileWarning({
    departed: preview.count,
    totalUsers: preview.totalUsers,
    rosterY1: preview.rosterY1,
    rosterY2: preview.rosterY2,
  })
  return NextResponse.json({ ...preview, warning })
}

// POST /api/admin/reconcile  { confirm: true } — hard-remove students absent from every roster.
// Requires explicit confirmation; the DB function additionally refuses when the roster is empty.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== true) {
    return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
  }
  const supabase = createServiceClient()
  const removed = await pruneDeparted(supabase)
  return NextResponse.json({ ok: true, removed })
}
