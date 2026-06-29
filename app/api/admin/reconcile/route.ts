import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { previewDeparted, pruneDeparted, previewInvalid, pruneInvalid, reconcileWarning } from '@/lib/reconcile'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/admin/reconcile — preview students no longer in any roster, plus email-less junk accounts
// (admin only). The dashboard renders counts + samples + a warning before the admin confirms.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const [preview, invalid] = await Promise.all([previewDeparted(supabase), previewInvalid(supabase)])
  const warning = reconcileWarning({
    departed: preview.count,
    totalUsers: preview.totalUsers,
    rosterY1: preview.rosterY1,
    rosterY2: preview.rosterY2,
  })
  return NextResponse.json({ ...preview, warning, invalid })
}

// POST /api/admin/reconcile  { confirm: true, target?: 'departed' | 'invalid' } — hard-remove either
// students absent from the rosters (default) or email-less junk accounts. Requires explicit
// confirmation; the departed prune additionally refuses in the DB unless BOTH rosters are present.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== true) {
    return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
  }
  const supabase = createServiceClient()
  const removed = body?.target === 'invalid' ? await pruneInvalid(supabase) : await pruneDeparted(supabase)
  return NextResponse.json({ ok: true, removed })
}
