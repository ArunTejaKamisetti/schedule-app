import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import {
  DEFAULT_PROFILE, loadInstitutionProfile, sanitizeProfilePatch, saveProfilePatch,
} from '@/lib/institution-profile'

export const runtime = 'nodejs'

// GET /api/admin/profile — the EFFECTIVE Institution Profile (built-in IIM-K defaults with any saved
// concern rows merged on top) plus the pristine defaults (so the dashboard can offer "reset to
// default"). Drives the Institution Profile admin page.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  const profile = await loadInstitutionProfile(createServiceClient())
  return NextResponse.json({ profile, defaults: DEFAULT_PROFILE })
}

// POST /api/admin/profile  body: a partial profile, e.g. { colors: {...} } or { sections, keywords }.
// Each present concern is sanitised (known fields only, hex-validated colours, compilable regex) and
// upserted as its own `institution_profile` row. The next sync reads the merged profile — no redeploy.
export async function POST(req: NextRequest) {
  const adminEmail = await requireAdmin()
  if (!adminEmail) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const patch = sanitizeProfilePatch(body)
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid profile fields to save.' }, { status: 400 })
  }

  try {
    const saved = await saveProfilePatch(createServiceClient(), patch, adminEmail)
    const profile = await loadInstitutionProfile(createServiceClient())
    return NextResponse.json({ ok: true, saved, profile })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 })
  }
}
